import type { Hex, Terrain } from './types'
import { getGlobalProductionMultiplier, GLOBAL_BUFFS } from './globalBuffs'

export interface OregonCapitalistState {
  hexes: Hex[]
  ownedHexIds: Set<string>
  resources: Record<Terrain, number>
  money: number
  hexLevels: Record<string, number>
  /** Fixed tier per hex, set at unlock. Tier determines base production and level curve. */
  hexTiers: Record<string, number>
  /** Manager tier per hex. 0 or absent = no manager. Only tier N manager can be hired for tier N hex. */
  hexManagers: Record<string, number>
  /** IDs of purchased global buffs (stack multiplicatively) */
  purchasedGlobalBuffs: string[]
  lastTickTimestamp: number
}

const BASE_UNLOCK = 15
const UNLOCK_MULTIPLIER = 1.15
const BASE_UPGRADE_COST = 50
const UPGRADE_MULTIPLIER = 1.07
const BASE_HIRE_COST = 100
const HIRE_MULTIPLIER = 2.5
const MONEY_PER_RESOURCE = 0.5

/** Base production per second at level 1. Higher tier = higher base. */
const BASE_PRODUCTION = 0.5
const BASE_MULTIPLIER_PER_TIER = 1.4

/** Curve exponent: tier 1 = 1.0 (linear), higher tiers scale better with level. */
const CURVE_EXPONENT_BASE = 1.0
const CURVE_EXPONENT_PER_TIER = 0.02

const CLICK_PRODUCTION_BASE = 1

/** Unlock cost scales with hex index AND total resource production per second. */
export function getUnlockCost(hexIndex: number, totalProductionPerSec: number): number {
  const base = Math.floor(BASE_UNLOCK * Math.pow(UNLOCK_MULTIPLIER, hexIndex))
  const productionScale = Math.max(1, 1 + totalProductionPerSec / 5)
  return Math.floor(base * productionScale)
}

/** Helper to compute total resource production per second from state. */
export function getTotalProductionPerSec(state: OregonCapitalistState): number {
  let total = 0
  for (const hexId of state.ownedHexIds) {
    if (!state.hexManagers?.[hexId]) continue
    const hex = state.hexes.find((h) => h.id === hexId)
    if (hex && hex.terrain !== 'desert') {
      const level = state.hexLevels[hexId] ?? 1
      const tier = state.hexTiers?.[hexId] ?? 1
      total += getProductionPerSecond(tier, level)
    }
  }
  const mult = getGlobalProductionMultiplier(state.purchasedGlobalBuffs ?? [])
  return total * mult
}

export function getUpgradeCost(level: number): number {
  return Math.floor(BASE_UPGRADE_COST * Math.pow(UPGRADE_MULTIPLIER, level))
}

/** Cost to hire a tier N manager (enables passive production for that hex). */
export function getHireCost(tier: number): number {
  return Math.floor(BASE_HIRE_COST * Math.pow(HIRE_MULTIPLIER, tier - 1))
}

/** Production per second. Tier sets base and curve; level scales within that curve. */
export function getProductionPerSecond(tier: number, level: number): number {
  const base = BASE_PRODUCTION * Math.pow(BASE_MULTIPLIER_PER_TIER, tier - 1)
  const exponent = CURVE_EXPONENT_BASE + (tier - 1) * CURVE_EXPONENT_PER_TIER
  return base * Math.pow(level, exponent)
}

/** Click production. Same tier/level logic. */
export function getClickProduction(tier: number, level: number): number {
  const base = CLICK_PRODUCTION_BASE * Math.pow(BASE_MULTIPLIER_PER_TIER, tier - 1)
  const exponent = CURVE_EXPONENT_BASE + (tier - 1) * CURVE_EXPONENT_PER_TIER
  return base * Math.pow(level, exponent)
}

/**
 * Tick applies passive production only for hexes that have a manager hired.
 * Hexes without a manager require clicks to produce.
 */
export function tick(state: OregonCapitalistState, now: number): OregonCapitalistState {
  const elapsed = Math.min((now - state.lastTickTimestamp) / 1000, 60 * 60 * 24)
  if (elapsed <= 0) return { ...state, lastTickTimestamp: now }

  const resources = { ...state.resources }
  let money = state.money

  for (const hexId of state.ownedHexIds) {
    const managerTier = state.hexManagers?.[hexId]
    if (!managerTier) continue
    const hex = state.hexes.find((h) => h.id === hexId)
    if (!hex || hex.terrain === 'desert') continue
    const level = state.hexLevels[hexId] ?? 1
    const tier = state.hexTiers?.[hexId] ?? 1
    const baseProduced = getProductionPerSecond(tier, level) * elapsed
    const mult = getGlobalProductionMultiplier(state.purchasedGlobalBuffs ?? [])
    const produced = baseProduced * mult
    resources[hex.terrain] = (resources[hex.terrain] ?? 0) + produced
    money += produced * MONEY_PER_RESOURCE
  }

  return { ...state, resources, money, lastTickTimestamp: now }
}

export function produceFromClick(
  state: OregonCapitalistState,
  hexId: string
): OregonCapitalistState | null {
  if (!state.ownedHexIds.has(hexId)) return null
  const hex = state.hexes.find((h) => h.id === hexId)
  if (!hex || hex.terrain === 'desert') return null

  const level = state.hexLevels[hexId] ?? 1
  const tier = state.hexTiers?.[hexId] ?? 1
  const baseProduced = getClickProduction(tier, level)
  const mult = getGlobalProductionMultiplier(state.purchasedGlobalBuffs ?? [])
  const produced = baseProduced * mult

  return {
    ...state,
    resources: {
      ...state.resources,
      [hex.terrain]: (state.resources[hex.terrain] ?? 0) + produced,
    },
    money: state.money + produced * MONEY_PER_RESOURCE,
  }
}

/** Resource types that can be used to pay for hex unlock (excludes desert). */
const PAYABLE_TERRAINS: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

export function unlockHex(
  state: OregonCapitalistState,
  hexId: string,
  ownedCount: number
): OregonCapitalistState | null {
  const hex = state.hexes.find((h) => h.id === hexId)
  if (!hex || hex.terrain === 'desert') return null

  const totalProd = getTotalProductionPerSec(state)
  const cost = getUnlockCost(Math.max(0, ownedCount - 1), totalProd)

  // Can pay with any resource type (avoids getting stuck with only one resource)
  const spendFrom = PAYABLE_TERRAINS
    .filter((t) => (state.resources[t] ?? 0) >= cost)
    .sort((a, b) => (state.resources[b] ?? 0) - (state.resources[a] ?? 0))[0]
  if (!spendFrom) return null

  const sameTerrainCount = Array.from(state.ownedHexIds).filter(
    (id) => state.hexes.find((h) => h.id === id)?.terrain === hex.terrain
  ).length
  const tier = sameTerrainCount + 1

  const newResources = { ...state.resources }
  newResources[spendFrom] = (newResources[spendFrom] ?? 0) - cost

  return {
    ...state,
    resources: newResources,
    ownedHexIds: new Set([...state.ownedHexIds, hexId]),
    hexLevels: { ...state.hexLevels, [hexId]: 1 },
    hexTiers: { ...state.hexTiers, [hexId]: tier },
  }
}

export function upgradeHex(state: OregonCapitalistState, hexId: string): OregonCapitalistState | null {
  if (!state.ownedHexIds.has(hexId)) return null
  const level = state.hexLevels[hexId] ?? 1
  const cost = getUpgradeCost(level)
  if (state.money < cost) return null

  return {
    ...state,
    money: state.money - cost,
    hexLevels: { ...state.hexLevels, [hexId]: level + 1 },
  }
}

/** Hire a manager for a hex. Manager tier must match hex tier. Enables passive production. */
export function hireManager(state: OregonCapitalistState, hexId: string): OregonCapitalistState | null {
  if (!state.ownedHexIds.has(hexId)) return null
  if (state.hexManagers?.[hexId]) return null
  const tier = state.hexTiers?.[hexId] ?? 1
  const cost = getHireCost(tier)
  if (state.money < cost) return null

  return {
    ...state,
    money: state.money - cost,
    hexManagers: { ...state.hexManagers, [hexId]: tier },
  }
}

/** Purchase a global buff. Applies to all production (click + passive). */
export function purchaseGlobalBuff(state: OregonCapitalistState, buffId: string): OregonCapitalistState | null {
  const buff = GLOBAL_BUFFS.find((b) => b.id === buffId)
  if (!buff) return null
  if ((state.purchasedGlobalBuffs ?? []).includes(buffId)) return null
  const managersHired = Object.keys(state.hexManagers ?? {}).length
  const hexesOwned = state.ownedHexIds.size
  if (managersHired < buff.minManagersRequired || hexesOwned < buff.minHexesRequired) return null
  if (state.money < buff.cost) return null

  return {
    ...state,
    money: state.money - buff.cost,
    purchasedGlobalBuffs: [...(state.purchasedGlobalBuffs ?? []), buffId],
  }
}
