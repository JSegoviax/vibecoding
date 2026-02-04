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

export type UnlockRequirementItem = { terrain: Terrain; amount: number }

export type UnlockRequirement =
  | { kind: 'anySingle'; cost: number }
  | { kind: 'specific'; items: UnlockRequirementItem[]; cost: number }

function hashToUint32(input: string): number {
  // djb2-ish, deterministic across sessions
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0
  }
  return h >>> 0
}

function terrainsProducedByPlayer(state: OregonCapitalistState): Terrain[] {
  const set = new Set<Terrain>()
  for (const id of state.ownedHexIds) {
    const hex = state.hexes.find((h) => h.id === id)
    if (hex && hex.terrain !== 'desert') set.add(hex.terrain)
  }
  return Array.from(set)
}

function clampMin(n: number, min: number): number {
  return n < min ? min : n
}

function splitCost(total: number, parts: number[]): number[] {
  const raw = parts.map((p) => Math.floor(total * p))
  let sum = raw.reduce((a, b) => a + b, 0)
  // distribute remainder to earliest items
  for (let i = 0; sum < total; i = (i + 1) % raw.length) {
    raw[i] += 1
    sum += 1
  }
  return raw
}

/**
 * Unlock requirements progression:
 * - Early: any single resource can unlock (avoids deadlocks).
 * - Mid: some unlocks require a specific resource type.
 * - Later: some unlocks require 2+ resource types.
 *
 * Requirements are deterministic per (hexId, ownedCount) so UI stays stable.
 * IMPORTANT: Requirements only pull from terrains the player can currently produce
 * (i.e., terrains already owned), so unlocks are always achievable.
 */
export function getUnlockRequirement(
  state: OregonCapitalistState,
  hexId: string,
  ownedCount: number
): UnlockRequirement | null {
  const hex = state.hexes.find((h) => h.id === hexId)
  if (!hex || hex.terrain === 'desert') return null

  const totalProd = getTotalProductionPerSec(state)
  const cost = getUnlockCost(Math.max(0, ownedCount - 1), totalProd)

  // Early game: keep it flexible.
  if (ownedCount < 5) return { kind: 'anySingle', cost }

  const produced = terrainsProducedByPlayer(state).filter((t) => t !== 'desert')
  const producedPool = produced.length > 0 ? produced : PAYABLE_TERRAINS

  const seed = hashToUint32(`${hexId}:${ownedCount}`)
  const roll = seed % 100

  // Midgame: introduce specific resource unlocks
  // Later: introduce 2+ resource unlocks
  const enableTwo = ownedCount >= 10 && producedPool.length >= 2
  const enableThree = ownedCount >= 18 && producedPool.length >= 3

  // probabilities (tuned to match "some" + "mid requires 2+")
  const pSpecific = ownedCount < 10 ? 35 : ownedCount < 18 ? 25 : 20
  const pTwo = enableTwo ? (ownedCount < 18 ? 45 : 55) : 0
  const pThree = enableThree ? 15 : 0

  // Pick requirement kind deterministically
  if (roll < pSpecific) {
    const idx = seed % producedPool.length
    const t = producedPool[idx]
    return { kind: 'specific', cost, items: [{ terrain: t, amount: cost }] }
  }

  if (enableTwo && roll < pSpecific + pTwo) {
    const i1 = seed % producedPool.length
    const i2 = (seed >>> 8) % producedPool.length
    const t1 = producedPool[i1]
    const t2 = producedPool[i2 === i1 ? (i2 + 1) % producedPool.length : i2]
    const [a1, a2] = splitCost(cost, [0.6, 0.4]).map((a) => clampMin(a, 1))
    return {
      kind: 'specific',
      cost,
      items: [
        { terrain: t1, amount: a1 },
        { terrain: t2, amount: a2 },
      ],
    }
  }

  if (enableThree && roll < pSpecific + pTwo + pThree) {
    const i1 = seed % producedPool.length
    const i2 = (seed >>> 8) % producedPool.length
    const i3 = (seed >>> 16) % producedPool.length
    const picked = [producedPool[i1], producedPool[i2], producedPool[i3]].filter(
      (t, idx, arr) => arr.indexOf(t) === idx
    )
    // ensure 3 unique; if not enough, fall back to 2
    if (picked.length < 3) {
      const uniques = Array.from(new Set(producedPool))
      if (uniques.length >= 3) picked.splice(0, picked.length, uniques[0], uniques[1], uniques[2])
    }
    const [a1, a2, a3] = splitCost(cost, [0.5, 0.3, 0.2]).map((a) => clampMin(a, 1))
    return {
      kind: 'specific',
      cost,
      items: [
        { terrain: picked[0], amount: a1 },
        { terrain: picked[1], amount: a2 },
        { terrain: picked[2], amount: a3 },
      ],
    }
  }

  // Default fallback: any single resource.
  return { kind: 'anySingle', cost }
}

export function canAffordUnlock(state: OregonCapitalistState, req: UnlockRequirement): boolean {
  if (req.kind === 'anySingle') {
    return PAYABLE_TERRAINS.some((t) => (state.resources[t] ?? 0) >= req.cost)
  }
  return req.items.every((it) => (state.resources[it.terrain] ?? 0) >= it.amount)
}

export function payUnlockCost(
  state: OregonCapitalistState,
  req: UnlockRequirement
): { resources: Record<Terrain, number>; paidLabel: string } | null {
  if (req.kind === 'anySingle') {
    const spendFrom = PAYABLE_TERRAINS
      .filter((t) => (state.resources[t] ?? 0) >= req.cost)
      .sort((a, b) => (state.resources[b] ?? 0) - (state.resources[a] ?? 0))[0]
    if (!spendFrom) return null
    const newResources = { ...state.resources }
    newResources[spendFrom] = (newResources[spendFrom] ?? 0) - req.cost
    return { resources: newResources, paidLabel: spendFrom }
  }

  const newResources = { ...state.resources }
  for (const it of req.items) {
    if ((newResources[it.terrain] ?? 0) < it.amount) return null
    newResources[it.terrain] = (newResources[it.terrain] ?? 0) - it.amount
  }
  return { resources: newResources, paidLabel: 'multi' }
}

export function unlockHex(
  state: OregonCapitalistState,
  hexId: string,
  ownedCount: number
): OregonCapitalistState | null {
  const hex = state.hexes.find((h) => h.id === hexId)
  if (!hex || hex.terrain === 'desert') return null

  const req = getUnlockRequirement(state, hexId, ownedCount)
  if (!req) return null
  if (!canAffordUnlock(state, req)) return null

  const sameTerrainCount = Array.from(state.ownedHexIds).filter(
    (id) => state.hexes.find((h) => h.id === id)?.terrain === hex.terrain
  ).length
  const tier = sameTerrainCount + 1

  const paid = payUnlockCost(state, req)
  if (!paid) return null

  return {
    ...state,
    resources: paid.resources,
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
