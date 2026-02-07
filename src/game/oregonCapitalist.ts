import type { Hex, Terrain } from './types'
import { getGlobalProductionMultiplier, GLOBAL_BUFFS, hasAutoUpgradeBuff, hasAutoSpiritShopBuff } from './globalBuffs'
import { MILESTONES, COST_RATE, GLOBAL_MILESTONES, TERRAIN_CONFIG } from './constants/progression'
import { calculateClaimableSpirits, getSpiritProductionMultiplier, PRESTIGE_SHOP } from './prestige'
import { getAdjacencyMultiplier } from './adjacency'
import type { ActiveEvent } from './trailEvents'
import { checkEventTrigger, getRandomEvent, isEventActive } from './trailEvents'

export type { ActiveEvent }

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
  /** When true, auto hex upgrader buff does not run (player paused it) */
  autoUpgradePaused?: boolean
  /** When true, auto Spirit Shop buff does not run (player paused it) */
  autoSpiritShopPaused?: boolean
  /** Cycle progress per hex (0 to 1). Only for hexes with managers. */
  hexProgress?: Record<string, number>
  /** Prestige system: Pioneer Spirits */
  lifetimeEarnings?: number
  pioneerSpirits?: number
  totalSpiritsEarned?: number
  prestigeUpgrades?: Record<string, number>
  /** Trail Events: Active temporary buff */
  activeEvent?: ActiveEvent | null
  /** Timestamp of last save (for offline earnings) */
  lastSaveTimestamp?: number
  lastTickTimestamp: number
}

const BASE_UNLOCK = 15
const UNLOCK_MULTIPLIER = 1.15
const BASE_UPGRADE_COST = 50
const BASE_HIRE_COST = 100
const HIRE_MULTIPLIER = 2.5
const MONEY_PER_RESOURCE = 0.5
const MIN_CYCLE_TIME = 0.1 // Minimum cycle time before doubling payout instead

/** Number of milestones that are <= level. */
export function getMilestonesReached(level: number): number {
  return MILESTONES.filter((m) => m <= level).length
}

/** Get cycle time for a hex based on terrain and milestones reached. */
export function getCycleTime(terrain: Terrain, level: number): number {
  if (terrain === 'desert') return 1.0
  const config = TERRAIN_CONFIG[terrain as keyof typeof TERRAIN_CONFIG]
  if (!config) return 1.0
  const milestonesReached = getMilestonesReached(level)
  const cycleTime = config.baseCycleTime / Math.pow(2, milestonesReached)
  return Math.max(MIN_CYCLE_TIME, cycleTime)
}

/** Get payout amount for a hex cycle. If cycle time is at minimum, double the payout. */
export function getCyclePayout(terrain: Terrain, level: number): { resources: number; multiplier: number } {
  if (terrain === 'desert') return { resources: 0, multiplier: 1 }
  const config = TERRAIN_CONFIG[terrain as keyof typeof TERRAIN_CONFIG]
  if (!config) return { resources: 1, multiplier: 1 }
  const milestonesReached = getMilestonesReached(level)
  const cycleTime = config.baseCycleTime / Math.pow(2, milestonesReached)
  const multiplier = cycleTime < MIN_CYCLE_TIME ? Math.pow(2, milestonesReached + 1) : Math.pow(2, milestonesReached)
  return { resources: config.baseValue, multiplier }
}

/** Unlock cost scales with hex index AND total resource production per second. */
export function getUnlockCost(hexIndex: number, totalProductionPerSec: number): number {
  const base = Math.floor(BASE_UNLOCK * Math.pow(UNLOCK_MULTIPLIER, hexIndex))
  const productionScale = Math.max(1, 1 + totalProductionPerSec / 5)
  return Math.floor(base * productionScale)
}

/** Helper to compute total resource production per second from state (cycle-based). */
export function getTotalProductionPerSec(state: OregonCapitalistState): number {
  let total = 0
  for (const hexId of state.ownedHexIds) {
    if (!state.hexManagers?.[hexId]) continue
    const hex = state.hexes.find((h) => h.id === hexId)
    if (hex && hex.terrain !== 'desert') {
      const level = state.hexLevels[hexId] ?? 1
      const { productionMult, cycleTimeMult } = getAdjacencyMultiplier(
        hexId,
        state.hexes,
        state.ownedHexIds
      )
      total += getProductionPerSecond(hex.terrain, level, productionMult, cycleTimeMult)
    }
  }
  const buffMult = getGlobalProductionMultiplier(state.purchasedGlobalBuffs ?? [])
  const spiritMult = getSpiritProductionMultiplier(state.pioneerSpirits ?? 0)
  return total * buffMult * spiritMult
}

/** When ALL owned non-desert hexes reach level >= threshold, money gen gets 2x. Stacks per GLOBAL_MILESTONES. */
export function getGlobalProgressMoneyMultiplier(state: OregonCapitalistState): number {
  const ownedNonDesert = Array.from(state.ownedHexIds).filter((id) => {
    const hex = state.hexes.find((h) => h.id === id)
    return hex && hex.terrain !== 'desert'
  })
  if (ownedNonDesert.length === 0) return 1
  let mult = 1
  for (const threshold of GLOBAL_MILESTONES) {
    const allAtOrAbove = ownedNonDesert.every((id) => (state.hexLevels[id] ?? 1) >= threshold)
    if (allAtOrAbove) mult *= 2
  }
  return mult
}

export function getUpgradeCost(level: number, upgradeDiscount: number = 0): number {
  const base = Math.floor(BASE_UPGRADE_COST * Math.pow(COST_RATE, level))
  return Math.floor(base * (1 - upgradeDiscount))
}

/** Calculate max affordable levels using the formula: n = log_r((Money * (r - 1) / currentPrice) + 1) */
export function calculateMaxAffordable(
  currentLevel: number,
  money: number,
  baseCost = BASE_UPGRADE_COST,
  upgradeDiscount = 0
): { count: number; cost: number } {
  const r = COST_RATE
  const basePrice = baseCost * Math.pow(r, currentLevel)
  const currentPrice = Math.floor(basePrice * (1 - upgradeDiscount))
  if (money < currentPrice) return { count: 0, cost: 0 }
  const n = Math.floor(Math.log((money * (r - 1) / currentPrice) + 1) / Math.log(r))
  const totalCost = currentPrice * (Math.pow(r, n) - 1) / (r - 1)
  return { count: Math.max(0, n), cost: Math.floor(totalCost) }
}

/** Cost to hire a tier N manager (enables passive production for that hex). */
export function getHireCost(
  tier: number,
  prestigeUpgrades?: Record<string, number>,
  activeEvent?: ActiveEvent | null
): number {
  let cost = Math.floor(BASE_HIRE_COST * Math.pow(HIRE_MULTIPLIER, tier - 1))
  // Industrialist: 10 + level % discount, capped at 50%
  const industrialistLevel = prestigeUpgrades?.industrialist ?? 0
  if (industrialistLevel > 0) {
    const discount = Math.min(50, 10 + industrialistLevel) / 100
    cost = Math.floor(cost * (1 - discount))
  }
  // Traveling Bard event: 50% cheaper managers
  if (activeEvent && activeEvent.effectType === 'manager_cost_reduction') {
    cost = Math.floor(cost * activeEvent.multiplier)
  }
  return cost
}

/** Average production per second (for display). Uses cycle-based calculation. */
export function getProductionPerSecond(
  terrain: Terrain,
  level: number,
  adjacencyMult: number = 1,
  adjacencyCycleMult: number = 1
): number {
  const baseCycleTime = getCycleTime(terrain, level)
  const cycleTime = baseCycleTime * adjacencyCycleMult
  const { resources, multiplier } = getCyclePayout(terrain, level)
  return (resources * multiplier * adjacencyMult) / cycleTime
}

/** Click production: instant cycle completion. */
export function getClickProduction(terrain: Terrain, level: number): number {
  const { resources, multiplier } = getCyclePayout(terrain, level)
  return resources * multiplier
}

/**
 * Tick applies cycle-based production only for hexes that have a manager hired.
 * Each hex has a progress (0-1) that fills based on cycle time.
 * When progress >= 1, payout resources/money and reset progress.
 */
export function tick(state: OregonCapitalistState, now: number): OregonCapitalistState {
  const elapsed = Math.min((now - state.lastTickTimestamp) / 1000, 60 * 60 * 24)
  if (elapsed <= 0) return { ...state, lastTickTimestamp: now }

  const resources = { ...state.resources }
  let money = state.money
  let lifetimeEarnings = state.lifetimeEarnings ?? 0
  const hexProgress = { ...(state.hexProgress ?? {}) }
  const globalMult = getGlobalProductionMultiplier(state.purchasedGlobalBuffs ?? [])
  const spiritMult = getSpiritProductionMultiplier(state.pioneerSpirits ?? 0)
  const moneyMult = getGlobalProgressMoneyMultiplier(state)

  // Check for trail events
  let activeEvent = state.activeEvent ?? null
  if (!isEventActive(activeEvent, now)) {
    activeEvent = null
    if (checkEventTrigger()) {
      const event = getRandomEvent()
      activeEvent = { ...event, startTime: now }
    }
  }

  // Apply event multipliers
  let eventGlobalMult = 1
  if (activeEvent && activeEvent.effectType === 'global_production') {
    eventGlobalMult = activeEvent.multiplier
  }

  for (const hexId of state.ownedHexIds) {
    const managerTier = state.hexManagers?.[hexId]
    if (!managerTier) continue
    const hex = state.hexes.find((h) => h.id === hexId)
    if (!hex || hex.terrain === 'desert') continue
    const level = state.hexLevels[hexId] ?? 1
    const { productionMult, cycleTimeMult } = getAdjacencyMultiplier(
      hexId,
      state.hexes,
      state.ownedHexIds
    )
    const baseCycleTime = getCycleTime(hex.terrain, level)
    const cycleTime = baseCycleTime * cycleTimeMult
    const currentProgress = hexProgress[hexId] ?? 0
    const newProgress = currentProgress + elapsed / cycleTime

    // Process complete cycles
    const cyclesCompleted = Math.floor(newProgress)
    if (cyclesCompleted > 0) {
      const { resources: payoutAmount, multiplier } = getCyclePayout(hex.terrain, level)
      const produced = payoutAmount * multiplier * productionMult * globalMult * spiritMult * eventGlobalMult * cyclesCompleted
      resources[hex.terrain] = (resources[hex.terrain] ?? 0) + produced
      const moneyEarned = produced * MONEY_PER_RESOURCE * moneyMult
      money += moneyEarned
      lifetimeEarnings += moneyEarned
    }

    // Store remaining progress (0 to 1)
    hexProgress[hexId] = newProgress - cyclesCompleted
  }

  return { ...state, resources, money, lifetimeEarnings, hexProgress, activeEvent, lastTickTimestamp: now }
}

/**
 * When Auto Hex Upgrader buff is purchased and not paused, automatically upgrade
 * hexes that the player can afford. Runs after tick. Upgrades cheapest first.
 */
export function applyAutoUpgrades(state: OregonCapitalistState): OregonCapitalistState {
  if (!hasAutoUpgradeBuff(state.purchasedGlobalBuffs ?? [])) return state
  if (state.autoUpgradePaused) return state

  let s = state
  let changed = true
  while (changed) {
    changed = false
    const candidates = Array.from(s.ownedHexIds)
      .map((hexId) => {
        const hex = s.hexes.find((h) => h.id === hexId)
        if (!hex || hex.terrain === 'desert') return null
        const level = s.hexLevels[hexId] ?? 1
        const cost = getUpgradeCost(level)
        return { hexId, cost }
      })
      .filter((x): x is { hexId: string; cost: number } => x !== null && s.money >= x.cost)
      .sort((a, b) => a.cost - b.cost)

    const next = candidates[0] ? upgradeHex(s, candidates[0].hexId) : null
    if (next) {
      s = next
      changed = true
    }
  }
  return s
}

/**
 * When Auto Spirit Shop buff is purchased and not paused, automatically purchase
 * cheapest affordable prestige upgrade. Runs after tick.
 */
export function applyAutoSpiritShop(state: OregonCapitalistState): OregonCapitalistState {
  if (!hasAutoSpiritShopBuff(state.purchasedGlobalBuffs ?? [])) return state
  if (state.autoSpiritShopPaused) return state
  const spirits = state.pioneerSpirits ?? 0
  if (spirits <= 0) return state

  const candidates = PRESTIGE_SHOP.map((upgrade) => {
    const currentLevel = state.prestigeUpgrades?.[upgrade.id] ?? 0
    const cost = upgrade.cost * (currentLevel + 1)
    return { upgradeId: upgrade.id, cost }
  }).filter((c) => spirits >= c.cost).sort((a, b) => a.cost - b.cost)

  const cheapest = candidates[0]
  if (!cheapest) return state
  return purchasePrestigeUpgrade(state, cheapest.upgradeId) ?? state
}

export function produceFromClick(
  state: OregonCapitalistState,
  hexId: string
): OregonCapitalistState | null {
  if (!state.ownedHexIds.has(hexId)) return null
  const hex = state.hexes.find((h) => h.id === hexId)
  if (!hex || hex.terrain === 'desert') return null

  const level = state.hexLevels[hexId] ?? 1
  const { productionMult } = getAdjacencyMultiplier(hexId, state.hexes, state.ownedHexIds)
  const { resources: payoutAmount, multiplier } = getCyclePayout(hex.terrain, level)
  const buffMult = getGlobalProductionMultiplier(state.purchasedGlobalBuffs ?? [])
  const spiritMult = getSpiritProductionMultiplier(state.pioneerSpirits ?? 0)
  // Apply click production event multiplier
  let clickMult = 1
  if (state.activeEvent && state.activeEvent.effectType === 'click_production') {
    clickMult = state.activeEvent.multiplier
  }
  const produced = payoutAmount * multiplier * productionMult * buffMult * spiritMult * clickMult
  const moneyMult = getGlobalProgressMoneyMultiplier(state)
  const hexProgress = { ...(state.hexProgress ?? {}) }
  hexProgress[hexId] = 0 // Reset progress on click
  const moneyEarned = produced * MONEY_PER_RESOURCE * moneyMult

  return {
    ...state,
    resources: {
      ...state.resources,
      [hex.terrain]: (state.resources[hex.terrain] ?? 0) + produced,
    },
    money: state.money + moneyEarned,
    lifetimeEarnings: (state.lifetimeEarnings ?? 0) + moneyEarned,
    hexProgress,
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
  const { upgradeDiscount } = getAdjacencyMultiplier(hexId, state.hexes, state.ownedHexIds)
  const cost = getUpgradeCost(level, upgradeDiscount)
  if (state.money < cost) return null

  return {
    ...state,
    money: state.money - cost,
    hexLevels: { ...state.hexLevels, [hexId]: level + 1 },
  }
}

/** Buy as many levels as possible for this hex with current money. Returns new state. */
export function buyMaxUpgrades(state: OregonCapitalistState, hexId: string): OregonCapitalistState | null {
  if (!state.ownedHexIds.has(hexId)) return null
  const level = state.hexLevels[hexId] ?? 1
  const { upgradeDiscount } = getAdjacencyMultiplier(hexId, state.hexes, state.ownedHexIds)
  const { count, cost } = calculateMaxAffordable(level, state.money, BASE_UPGRADE_COST, upgradeDiscount)
  if (count <= 0 || cost > state.money) return null
  return {
    ...state,
    money: state.money - cost,
    hexLevels: { ...state.hexLevels, [hexId]: level + count },
  }
}

/** Hire a manager for a hex. Manager tier must match hex tier. Enables passive production. */
export function hireManager(state: OregonCapitalistState, hexId: string): OregonCapitalistState | null {
  if (!state.ownedHexIds.has(hexId)) return null
  if (state.hexManagers?.[hexId]) return null
  const tier = state.hexTiers?.[hexId] ?? 1
  const cost = getHireCost(tier, state.prestigeUpgrades, state.activeEvent)
  if (state.money < cost) return null

  return {
    ...state,
    money: state.money - cost,
    hexManagers: { ...state.hexManagers, [hexId]: tier },
  }
}

/**
 * Prestige: Reset game progress in exchange for Pioneer Spirits.
 * Resets: money, resources, hexLevels, hexManagers, ownedHexIds (except starter)
 * Keeps: pioneerSpirits, lifetimeEarnings, prestigeUpgrades, totalSpiritsEarned
 */
export function prestige(state: OregonCapitalistState): OregonCapitalistState {
  const claimableSpirits = calculateClaimableSpirits(state.lifetimeEarnings ?? 0)
  if (claimableSpirits <= 0) return state // Can't prestige without earning spirits

  const newSpirits = (state.pioneerSpirits ?? 0) + claimableSpirits
  const totalSpirits = (state.totalSpiritsEarned ?? 0) + claimableSpirits

  // Find starter hex (first non-desert hex)
  const starterHex = state.hexes.find((h) => h.terrain !== 'desert') ?? state.hexes[0]
  const starterHexId = starterHex?.id

  // Apply manifest_destiny: start with 5 free hexes unlocked
  let initialOwnedHexIds = new Set<string>()
  let initialHexLevels: Record<string, number> = {}
  let initialHexTiers: Record<string, number> = {}

  if (starterHexId) {
    initialOwnedHexIds.add(starterHexId)
    initialHexLevels[starterHexId] = 1
    initialHexTiers[starterHexId] = 1

    // Manifest Destiny: 5 + level free hexes, capped at 19 (BFS from starter)
    const manifestLevel = state.prestigeUpgrades?.manifest_destiny ?? 0
    if (manifestLevel > 0) {
      const hexesToUnlock = Math.min(19, 5 + manifestLevel) - 1 // -1 for starter
      if (hexesToUnlock > 0) {
        const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const
        const match = starterHexId.match(/^h(-?\d+),(-?\d+)$/)
        if (match) {
          const byId = new Map(state.hexes.map((h) => [h.id, h]))
          const queue: [number, number][] = [[parseInt(match[1], 10), parseInt(match[2], 10)]]
          const visited = new Set<string>([starterHexId])
          let unlocked = 0
          while (queue.length > 0 && unlocked < hexesToUnlock) {
            const [q, r] = queue.shift()!
            for (const [dq, dr] of NEIGHBORS) {
              const nq = q + dq
              const nr = r + dr
              const nid = `h${nq},${nr}`
              if (visited.has(nid)) continue
              visited.add(nid)
              const neighbor = byId.get(nid)
              if (neighbor && neighbor.terrain !== 'desert') {
                initialOwnedHexIds.add(nid)
                initialHexLevels[nid] = 1
                const sameTerrainCount = Array.from(initialOwnedHexIds).filter(
                  (id) => state.hexes.find((h) => h.id === id)?.terrain === neighbor.terrain
                ).length
                initialHexTiers[nid] = sameTerrainCount
                unlocked++
                queue.push([nq, nr])
                if (unlocked >= hexesToUnlock) break
              }
            }
          }
        }
      }
    }
  }

  // Gold Rush Legacy: keep 5 + level % of money, capped at 50%
  const goldRushLevel = state.prestigeUpgrades?.gold_rush_legacy ?? 0
  const keptMoney =
    goldRushLevel > 0
      ? Math.floor(state.money * (Math.min(50, 5 + goldRushLevel) / 100))
      : 0

  return {
    ...state,
    money: keptMoney,
    resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, desert: 0 },
    hexLevels: initialHexLevels,
    hexTiers: initialHexTiers,
    hexManagers: {},
    ownedHexIds: initialOwnedHexIds,
    purchasedGlobalBuffs: [],
    autoUpgradePaused: false,
    hexProgress: {},
    pioneerSpirits: newSpirits,
    totalSpiritsEarned: totalSpirits,
    // lifetimeEarnings is kept (not reset)
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

/** Purchase a prestige upgrade using Pioneer Spirits. */
export function purchasePrestigeUpgrade(
  state: OregonCapitalistState,
  upgradeId: string
): OregonCapitalistState | null {
  const upgrade = PRESTIGE_SHOP.find((u) => u.id === upgradeId)
  if (!upgrade) return null
  const currentLevel = state.prestigeUpgrades?.[upgradeId] ?? 0
  const cost = upgrade.cost * (currentLevel + 1) // Cost increases per level
  if ((state.pioneerSpirits ?? 0) < cost) return null

  return {
    ...state,
    pioneerSpirits: (state.pioneerSpirits ?? 0) - cost,
    prestigeUpgrades: {
      ...(state.prestigeUpgrades ?? {}),
      [upgradeId]: currentLevel + 1,
    },
  }
}
