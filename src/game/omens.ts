/**
 * Oregon's Omens — deck, draw, and card effect application.
 * Card IDs match the feature spec (snake_case).
 */

import type { ActiveOmenEffect, GameState, PlayerId } from './types'
import type { Terrain } from './types'
import { appendGameLog } from './gameLog'

const TERRAINS: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

// ——— Card IDs (from spec) ———
export const BUFF_IDS = [
  'foragers_bounty',
  'sturdy_wagon_wheel',
  'well_stocked_pantry',
  'friendly_trade_caravan',
  'pathfinders_insight',
  'skilled_prospector',
  'reliable_harvest',
  'strategic_settlement_spot',
  'bountiful_pastures',
  'hidden_cache',
  'master_builders_plan',
  'boomtown_growth',
  'gold_rush',
  'robbers_regret',
  'manifest_destiny',
] as const

export const DEBUFF_IDS = [
  'dust_storm',
  'worn_out_tool',
  'confusing_tracks',
  'smallpox_scare',
  'lost_supplies',
  'broken_wagon_axle',
  'resource_theft',
  'drought',
  'bandit_ransom',
  'poor_trade_season',
  'dysentery_outbreak',
  'mass_exodus',
  'wagon_overturned',
  'robber_barons_demand',
  'famine_pestilence',
] as const

export type OmenCardId = (typeof BUFF_IDS)[number] | (typeof DEBUFF_IDS)[number]

/** Optional targets when playing a card (e.g. Robber's Regret: hex + player). */
export interface PlayOmenTargets {
  hexId?: string
  targetPlayerId?: PlayerId
  /** Single resource choice (e.g. Forager's Bounty: wood or wheat). */
  resourceChoice?: Terrain
  /** Pair choice (e.g. Skilled Prospector: ore+wood or brick+wheat). */
  resourceChoices?: [Terrain, Terrain]
  /** Gold Rush: 1 resource of choice in addition to 3 ore. */
  goldRushChoice?: Terrain
  /** Reliable Harvest: hex to get +1 from. */
  hexIdForHarvest?: string
  /** Sturdy Wagon Wheel: which to reduce (wood or brick). */
  roadDiscount?: 'wood' | 'brick'
}

const DEBUFF_SET = new Set<string>(DEBUFF_IDS)

// ——— Card catalog (display names and short effect text for UI) ———
const OMEN_CARD_NAMES: Record<string, string> = {
  foragers_bounty: "Forager's Bounty",
  sturdy_wagon_wheel: 'Sturdy Wagon Wheel',
  well_stocked_pantry: 'Well-Stocked Pantry',
  friendly_trade_caravan: 'Friendly Trade Caravan',
  pathfinders_insight: "Pathfinder's Insight",
  skilled_prospector: 'Skilled Prospector',
  reliable_harvest: 'Reliable Harvest',
  strategic_settlement_spot: 'Strategic Settlement Spot',
  bountiful_pastures: 'Bountiful Pastures',
  hidden_cache: 'Hidden Cache',
  master_builders_plan: "Master Builder's Plan",
  boomtown_growth: 'Boomtown Growth',
  gold_rush: 'Gold Rush!',
  robbers_regret: "Robber's Regret",
  manifest_destiny: 'Manifest Destiny',
}

export function getOmenCardName(cardId: string): string {
  return OMEN_CARD_NAMES[cardId] ?? cardId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function getOmenCardEffectText(cardId: string): string {
  const short: Record<string, string> = {
    foragers_bounty: 'Gain 1 Wood or 1 Wheat (your choice).',
    sturdy_wagon_wheel: 'Next road costs 1 less Wood or 1 less Brick.',
    well_stocked_pantry: 'Negate the next single resource loss from any source.',
    friendly_trade_caravan: 'Trade 2 of one resource for 1 of any other (once).',
    pathfinders_insight: 'Next road may be placed without adjacency (this turn).',
    skilled_prospector: 'Gain 1 Ore + 1 Wood, or 1 Brick + 1 Wheat (your choice).',
    reliable_harvest: 'Next roll: +1 resource from one of your producing hexes.',
    strategic_settlement_spot: 'Build one settlement for road cost (1 Wood, 1 Brick).',
    bountiful_pastures: 'Your Sheep hexes produce +1 for the next 2 rolls.',
    hidden_cache: 'Draw 2 random resources from the bank.',
    master_builders_plan: 'Build one road and one settlement for free.',
    boomtown_growth: 'Upgrade one of your settlements to a city for free.',
    gold_rush: 'Gain 3 Ore and 1 resource of your choice.',
    robbers_regret: 'Move the robber to any hex; optionally steal from a player there.',
    manifest_destiny: 'Gain 2 Victory Points.',
    dust_storm: 'Lose 1 random resource.',
    worn_out_tool: 'Next settlement costs +1 Sheep.',
    confusing_tracks: 'Next roll: −1 Wood from your production.',
    smallpox_scare: 'Lose 1 Victory Point.',
    lost_supplies: 'Lose 2 random resources.',
    broken_wagon_axle: 'Next road costs +1 Wood.',
    resource_theft: 'Robber moves; next player steals from you.',
    drought: 'Next 2 rolls: −1 Wheat from your production.',
    bandit_ransom: 'Lose 2 random resources.',
    poor_trade_season: 'Your next 2 trades use a worse rate.',
    dysentery_outbreak: 'Lose 1 Wheat; no Wheat production for 2 rolls.',
    mass_exodus: 'Remove one of your settlements; lose 1 VP.',
    wagon_overturned: 'Lose 1 random resource; cannot build next turn.',
    robber_barons_demand: "Two effects: the robber is placed on a random hex, then the next player (in turn order) immediately steals one random resource from you.",
    famine_pestilence: 'Next roll: no production for you.',
  }
  return short[cardId] ?? 'Play this card.'
}

export const MAX_OMENS_HAND_SIZE = 5

const DRAW_COST = { wheat: 1, sheep: 1, ore: 1 } as const

/** Deck recipe: [cardId, count]. 2× most buffs, 1× debuffs for balance. */
const DECK_RECIPE: [string, number][] = [
  ...BUFF_IDS.map(id => [id, 2] as [string, number]),
  ...DEBUFF_IDS.map(id => [id, 1] as [string, number]),
]

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Build and shuffle the Oregon's Omens deck. */
export function createOmensDeck(): string[] {
  const deck: string[] = []
  for (const [cardId, count] of DECK_RECIPE) {
    for (let i = 0; i < count; i++) deck.push(cardId)
  }
  return shuffle(deck)
}

/** True if Oregon's Omens is enabled for this game. */
export function isOmensEnabled(state: GameState): boolean {
  return Array.isArray(state.omensDeck)
}

/** True if the player can perform "Draw Omen Card" (phase, turn, resources, hand limit, not already drawn). */
export function canDrawOmenCard(state: GameState, playerId: PlayerId): boolean {
  if (!isOmensEnabled(state)) return false
  if (state.phase !== 'playing') return false
  const idx = state.players.findIndex(p => p.id === playerId)
  if (idx < 0 || state.currentPlayerIndex !== idx) return false
  const player = state.players[idx]
  const hand = player.omensHand ?? []
  if (hand.length >= MAX_OMENS_HAND_SIZE) return false
  if (player.hasDrawnOmenThisTurn === true) return false
  const r = player.resources
  if (r.wheat < DRAW_COST.wheat || r.sheep < DRAW_COST.sheep || r.ore < DRAW_COST.ore) return false
  return true
}

/** Refill deck from discard pile (shuffle discard into deck). */
function refillDeckFromDiscard(state: GameState): GameState {
  const discard = state.omensDiscardPile ?? []
  if (discard.length === 0) return state
  const newDeck = shuffle(discard)
  return {
    ...state,
    omensDeck: newDeck,
    omensDiscardPile: [],
  }
}

// ——— Phase 3: effect helpers (immutable) ———
function addResource(state: GameState, playerId: PlayerId, terrain: Terrain, count: number): GameState {
  if (terrain === 'desert' || count <= 0) return state
  const idx = state.players.findIndex(p => p.id === playerId)
  if (idx < 0) return state
  const p = state.players[idx]
  const res = { ...p.resources }
  res[terrain] = (res[terrain] ?? 0) + count
  const players = [...state.players]
  players[idx] = { ...p, resources: res }
  return { ...state, players }
}

function addResources(state: GameState, playerId: PlayerId, amounts: Partial<Record<Terrain, number>>): GameState {
  let next = state
  for (const t of TERRAINS) {
    const n = amounts[t] ?? 0
    if (n > 0) next = addResource(next, playerId, t, n)
  }
  return next
}

/** If Well-Stocked Pantry is active for this player, consume it and return true (cancel one loss). */
function consumeWellStockedPantry(state: GameState, playerId: PlayerId): { state: GameState; consumed: boolean } {
  const effects = state.activeOmensEffects ?? []
  const i = effects.findIndex(
    e => e.playerId === playerId && e.cardId === 'well_stocked_pantry' && e.triggerCondition === 'on_resource_loss'
  )
  if (i < 0) return { state, consumed: false }
  const nextEffects = effects.slice(0, i).concat(effects.slice(i + 1))
  return { state: { ...state, activeOmensEffects: nextEffects }, consumed: true }
}

/** Remove one resource of type from player; if Pantry active, consume it and skip one loss. Returns { state, pantryConsumed }. */
function removeResourceWithPantryCheck(
  state: GameState,
  playerId: PlayerId,
  terrain: Terrain,
  count: number
): { state: GameState; pantryConsumed: boolean } {
  let next = state
  let pantryConsumed = false
  for (let c = 0; c < count; c++) {
    const { state: s, consumed } = consumeWellStockedPantry(next, playerId)
    if (consumed) {
      pantryConsumed = true
      continue
    }
    const idx = next.players.findIndex(p => p.id === playerId)
    if (idx < 0) break
    const p = next.players[idx]
    const current = p.resources[terrain] ?? 0
    if (current <= 0) break
    const res = { ...p.resources }
    res[terrain] = current - 1
    const players = [...next.players]
    players[idx] = { ...p, resources: res }
    next = { ...next, players }
  }
  return { state: next, pantryConsumed }
}

/** Pick a random resource type the player has; remove one (with Pantry check). Returns { state, stolen, pantryConsumed? }. */
function removeOneRandomResource(
  state: GameState,
  playerId: PlayerId
): { state: GameState; stolen: Terrain | null; pantryConsumed?: boolean } {
  const idx = state.players.findIndex(p => p.id === playerId)
  if (idx < 0) return { state, stolen: null }
  const p = state.players[idx]
  const available: Terrain[] = []
  for (const t of TERRAINS) {
    const n = p.resources[t] ?? 0
    for (let i = 0; i < n; i++) available.push(t)
  }
  if (available.length === 0) return { state, stolen: null }
  const terrain = available[Math.floor(Math.random() * available.length)]
  const out = removeResourceWithPantryCheck(state, playerId, terrain, 1)
  return { state: out.state, stolen: terrain, pantryConsumed: out.pantryConsumed }
}

function removeOneRandomResourceStateOnly(state: GameState, playerId: PlayerId): GameState {
  return removeOneRandomResource(state, playerId).state
}

/** Remove up to `count` random resources (each can be negated by Pantry once). Returns state, removed list, and whether Pantry negated at least one. */
function removeRandomResources(state: GameState, playerId: PlayerId, count: number): { state: GameState; removed: Terrain[]; pantryConsumed: boolean } {
  let next = state
  const removed: Terrain[] = []
  let pantryConsumed = false
  for (let i = 0; i < count; i++) {
    const { state: s, stolen, pantryConsumed: pc } = removeOneRandomResource(next, playerId)
    next = s
    if (stolen) removed.push(stolen)
    if (pc) pantryConsumed = true
  }
  return { state: next, removed, pantryConsumed }
}

function addVP(state: GameState, playerId: PlayerId, delta: number): GameState {
  const idx = state.players.findIndex(p => p.id === playerId)
  if (idx < 0) return state
  const p = state.players[idx]
  const vp = Math.max(0, (p.victoryPoints ?? 0) + delta)
  const players = [...state.players]
  players[idx] = { ...p, victoryPoints: vp }
  return { ...state, players }
}

function addActiveEffect(
  state: GameState,
  cardId: string,
  playerId: PlayerId,
  appliedEffect: Record<string, unknown>,
  opts?: { turnsRemaining?: number; rollsRemaining?: number; triggerCondition?: string }
): GameState {
  const effects = [...(state.activeOmensEffects ?? []), { cardId, playerId, appliedEffect, ...opts }]
  return { ...state, activeOmensEffects: effects }
}

function removeActiveEffectByIndex(state: GameState, index: number): GameState {
  const effects = state.activeOmensEffects ?? []
  if (index < 0 || index >= effects.length) return state
  const next = effects.slice(0, index).concat(effects.slice(index + 1))
  return { ...state, activeOmensEffects: next }
}

/** Draw N random resources from bank (infinite bank). */
function drawRandomResourcesFromBank(state: GameState, playerId: PlayerId, count: number): GameState {
  let next = state
  for (let i = 0; i < count; i++) {
    const t = TERRAINS[Math.floor(Math.random() * TERRAINS.length)]
    next = addResource(next, playerId, t, 1)
  }
  return next
}

/** Draw N random resources from bank and return state plus list of drawn terrains (for UI feedback). */
function drawRandomResourcesFromBankWithFeedback(
  state: GameState,
  playerId: PlayerId,
  count: number
): { state: GameState; drawn: Terrain[] } {
  let next = state
  const drawn: Terrain[] = []
  for (let i = 0; i < count; i++) {
    const t = TERRAINS[Math.floor(Math.random() * TERRAINS.length)]
    next = addResource(next, playerId, t, 1)
    drawn.push(t)
  }
  return { state: next, drawn }
}

/** Apply debuff effect (Phase 3). Returns { state, lostResources?, pantryConsumed? } so UI can show what was lost / Pantry negated. */
function applyDebuffEffect(
  state: GameState,
  playerId: PlayerId,
  cardId: string
): GameState | { state: GameState; lostResources?: Terrain[]; pantryConsumed?: boolean } {
  const victimIndex = state.players.findIndex(p => p.id === playerId)
  if (victimIndex < 0) return state
  let next = state
  let lostResources: Terrain[] | undefined
  let pantryConsumed = false

  switch (cardId) {
    case 'dust_storm':
      next = removeOneRandomResourceStateOnly(next, playerId)
      break
    case 'smallpox_scare':
      next = addVP(next, playerId, -1)
      break
    case 'lost_supplies': {
      const out = removeRandomResources(next, playerId, 2)
      next = out.state
      lostResources = out.removed
      if (out.pantryConsumed) pantryConsumed = true
      break
    }
    case 'bandit_ransom': {
      const out = removeRandomResources(next, playerId, 2)
      next = out.state
      lostResources = out.removed
      if (out.pantryConsumed) pantryConsumed = true
      break
    }
    case 'wagon_overturned': {
      const out = removeOneRandomResource(next, playerId)
      next = out.state
      lostResources = out.stolen ? [out.stolen] : undefined
      if (out.pantryConsumed) pantryConsumed = true
      next = addActiveEffect(next, 'wagon_overturned', playerId, { type: 'cannot_build' }, { turnsRemaining: 1 })
      break
    }
    case 'dysentery_outbreak': {
      const out = removeResourceWithPantryCheck(next, playerId, 'wheat', 1)
      next = out.state
      if (out.pantryConsumed) pantryConsumed = true
      next = addActiveEffect(next, 'dysentery_outbreak', playerId, { type: 'no_wheat_production' }, { rollsRemaining: 2 })
      break
    }
    case 'resource_theft': {
      const hexes = state.hexes.filter(h => h.terrain !== 'desert')
      const hex = hexes[Math.floor(Math.random() * hexes.length)]
      const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
      const robberId = state.players[nextPlayerIndex]?.id
      next = { ...next, robberHexId: hex.id }
      if (robberId) {
        const { state: afterRemove, stolen, pantryConsumed: pc } = removeOneRandomResource(next, playerId)
        next = afterRemove
        if (stolen) next = addResource(next, robberId, stolen, 1)
        if (pc) pantryConsumed = true
      }
      break
    }
    case 'robber_barons_demand': {
      const hexes = state.hexes.filter(h => h.terrain !== 'desert')
      const hex = hexes[Math.floor(Math.random() * hexes.length)]
      const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
      const robberId = state.players[nextPlayerIndex]?.id
      next = { ...next, robberHexId: hex.id }
      if (robberId) {
        const { state: afterRemove, stolen, pantryConsumed: pc } = removeOneRandomResource(next, playerId)
        next = afterRemove
        if (stolen) next = addResource(next, robberId, stolen, 1)
        if (pc) pantryConsumed = true
      }
      break
    }
    case 'confusing_tracks':
      next = addActiveEffect(next, 'confusing_tracks', playerId, { type: 'production_mod', wood: -1 }, { rollsRemaining: 1 })
      break
    case 'drought':
      next = addActiveEffect(next, 'drought', playerId, { type: 'production_mod', wheat: -1 }, { rollsRemaining: 2 })
      break
    case 'famine_pestilence':
      next = addActiveEffect(next, 'famine_pestilence', playerId, { type: 'production_halt' }, { rollsRemaining: 1 })
      break
    case 'worn_out_tool':
      next = addActiveEffect(next, 'worn_out_tool', playerId, { type: 'cost_mod', structure: 'settlement', sheep: 1 })
      break
    case 'broken_wagon_axle':
      next = addActiveEffect(next, 'broken_wagon_axle', playerId, { type: 'cost_mod', structure: 'road', wood: 1 })
      break
    case 'poor_trade_season':
      next = addActiveEffect(next, 'poor_trade_season', playerId, { type: 'trade_worse', tradesLeft: 2 })
      break
    case 'mass_exodus': {
      const settlementVerts = Object.entries(next.vertices).filter(
        ([_, v]) => v.structure?.player === playerId && v.structure?.type === 'settlement'
      )
      let newVertices = next.vertices
      let settlementRemoved = false
      if (settlementVerts.length > 0) {
        const [vid] = settlementVerts[Math.floor(Math.random() * settlementVerts.length)]
        const v = next.vertices[vid]
        if (v?.structure) {
          newVertices = { ...next.vertices, [vid]: { ...v, structure: undefined } }
          settlementRemoved = true
        }
      }
      const newPlayers = next.players.map(p => {
        if (p.id !== playerId) return p
        const newVP = Math.max(0, (p.victoryPoints ?? 0) - 1)
        const newSettlementsLeft = settlementRemoved ? (p.settlementsLeft ?? 0) + 1 : (p.settlementsLeft ?? 0)
        return { ...p, victoryPoints: newVP, settlementsLeft: newSettlementsLeft }
      })
      next = { ...next, vertices: newVertices, players: newPlayers }
      break
    }
    default:
      break
  }
  if (pantryConsumed || lostResources !== undefined) {
    return { state: next, lostResources, pantryConsumed }
  }
  return next
}

/**
 * Perform "Draw Omen Card": deduct 1Wheat, 1Sheep, 1Ore; draw one card; if debuff, apply immediately and discard; else add to hand.
 * Returns new state (immutable).
 */
export function drawOmenCard(state: GameState, playerId: PlayerId): GameState {
  if (!canDrawOmenCard(state, playerId)) return state
  const playerIndex = state.players.findIndex(p => p.id === playerId)
  const player = state.players[playerIndex]

  let next = { ...state }
  // Refill deck if empty
  if ((next.omensDeck ?? []).length === 0) next = refillDeckFromDiscard(next)
  const deck = next.omensDeck ?? []
  const drawnCardId = deck[deck.length - 1]
  const newDeck = deck.slice(0, -1)

  const newDiscard = [...(next.omensDiscardPile ?? [])]
  const newHand = [...(player.omensHand ?? [])]
  if (DEBUFF_SET.has(drawnCardId)) {
    newDiscard.push(drawnCardId)
  } else {
    newHand.push(drawnCardId)
  }

  // Deduct resources
  const newResources = { ...player.resources }
  newResources.wheat -= DRAW_COST.wheat
  newResources.sheep -= DRAW_COST.sheep
  newResources.ore -= DRAW_COST.ore

  const newPlayers = [...next.players]
  newPlayers[playerIndex] = {
    ...player,
    resources: newResources,
    omensHand: newHand,
    hasDrawnOmenThisTurn: true,
  }

  let result: GameState = {
    ...next,
    omensDeck: newDeck,
    omensDiscardPile: newDiscard,
    players: newPlayers,
  }
  if (DEBUFF_SET.has(drawnCardId)) {
    const applied = applyDebuffEffect(result, playerId, drawnCardId)
    const nextState = 'state' in applied ? applied.state : applied
    const lostResources = 'lostResources' in applied ? applied.lostResources : undefined
    const pantryNegated = 'pantryConsumed' in applied && applied.pantryConsumed
    result = {
      ...nextState,
      lastOmenDebuffDrawn: { cardId: drawnCardId, playerId, ...(lostResources?.length ? { lostResources } : {}) },
      ...(pantryNegated ? { lastPantryNegation: { playerId, negatedCardId: drawnCardId } } : {}),
    }
    result = appendGameLog(result, {
      type: 'omen_draw_debuff',
      message: `Player ${playerId} drew ${getOmenCardName(drawnCardId)} (debuff)`,
      playerId,
    })
    if (pantryNegated) {
      result = appendGameLog(result, {
        type: 'pantry_negate',
        message: `Player ${playerId}'s Well-Stocked Pantry negated the debuff.`,
        playerId,
      })
    }
  } else {
    result = appendGameLog(result, {
      type: 'omen_buff',
      message: `Player ${playerId} drew ${getOmenCardName(drawnCardId)}`,
      playerId,
    })
  }
  return result
}

/** Card-specific preconditions for playing a buff (e.g. must have settlement left to build). */
function getBuffPlayPrecondition(state: GameState, playerId: PlayerId, cardId: string): boolean {
  const idx = state.players.findIndex(p => p.id === playerId)
  if (idx < 0) return false
  const p = state.players[idx]
  switch (cardId) {
    case 'strategic_settlement_spot':
      return (p.settlementsLeft ?? 0) > 0
    case 'master_builders_plan':
      return (p.settlementsLeft ?? 0) > 0 && (p.roadsLeft ?? 0) > 0
    case 'boomtown_growth':
      return (p.settlementsLeft ?? 0) < 5 // has at least one settlement on board
    default:
      return true
  }
}

/** True if the player can play this buff card from hand (phase, turn, in hand, !hasPlayedOmenThisTurn, preconditions). */
export function canPlayOmenCard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  _targets?: PlayOmenTargets
): boolean {
  if (!isOmensEnabled(state)) return false
  if (state.phase !== 'playing') return false
  const idx = state.players.findIndex(p => p.id === playerId)
  if (idx < 0 || state.currentPlayerIndex !== idx) return false
  const player = state.players[idx]
  const hand = player.omensHand ?? []
  if (!hand.includes(cardId)) return false
  if (player.hasPlayedOmenThisTurn === true) return false
  if (DEBUFF_SET.has(cardId)) return false // debuffs are not played from hand
  return getBuffPlayPrecondition(state, playerId, cardId)
}

/** Apply buff effect (Phase 3). */
function applyBuffEffect(
  state: GameState,
  cardId: string,
  playerId: PlayerId,
  targets?: PlayOmenTargets
): GameState {
  let next = state
  const idx = state.players.findIndex(p => p.id === playerId)
  if (idx < 0) return state

  switch (cardId) {
    case 'foragers_bounty': {
      const choice = targets?.resourceChoice ?? 'wood'
      if (choice === 'wood' || choice === 'wheat') next = addResource(next, playerId, choice, 1)
      break
    }
    case 'skilled_prospector': {
      const pair = targets?.resourceChoices ?? ['ore', 'wood']
      if (pair.length >= 2) next = addResources(next, playerId, { [pair[0]]: 1, [pair[1]]: 1 })
      break
    }
    case 'hidden_cache': {
      const { state: nextState, drawn } = drawRandomResourcesFromBankWithFeedback(next, playerId, 2)
      next = { ...nextState, lastOmenBuffPlayed: { cardId: 'hidden_cache', playerId, resourcesGained: drawn } }
      break
    }
    case 'gold_rush':
      next = addResource(next, playerId, 'ore', 3)
      next = addResource(next, playerId, targets?.goldRushChoice ?? 'ore', 1)
      break
    case 'manifest_destiny':
      next = addVP(next, playerId, 2)
      break
    case 'sturdy_wagon_wheel':
      next = addActiveEffect(next, 'sturdy_wagon_wheel', playerId, {
        type: 'cost_mod',
        structure: 'road',
        discount: targets?.roadDiscount ?? 'wood',
      })
      break
    case 'well_stocked_pantry':
      next = addActiveEffect(next, 'well_stocked_pantry', playerId, { type: 'negate_one_loss' }, {
        triggerCondition: 'on_resource_loss',
      })
      break
    case 'friendly_trade_caravan':
      next = addActiveEffect(next, 'friendly_trade_caravan', playerId, { type: 'one_time_2_1' })
      break
    case 'pathfinders_insight':
      next = addActiveEffect(next, 'pathfinders_insight', playerId, { type: 'road_no_adjacency' }, { turnsRemaining: 1 })
      break
    case 'reliable_harvest':
      next = addActiveEffect(
        next,
        'reliable_harvest',
        playerId,
        { type: 'production_bonus', hexId: targets?.hexIdForHarvest ?? state.hexes[0]?.id },
        { rollsRemaining: 1 }
      )
      break
    case 'strategic_settlement_spot':
      next = addActiveEffect(next, 'strategic_settlement_spot', playerId, {
        type: 'cost_mod',
        structure: 'settlement',
        override: { wood: 1, brick: 1 },
      })
      break
    case 'bountiful_pastures':
      next = addActiveEffect(next, 'bountiful_pastures', playerId, { type: 'production_mod', sheep: 1 }, {
        rollsRemaining: 2,
      })
      break
    case 'master_builders_plan':
      next = addActiveEffect(next, 'master_builders_plan', playerId, {
        type: 'free_build',
        road: 1,
        settlement: 1,
      })
      break
    case 'boomtown_growth':
      next = addActiveEffect(next, 'boomtown_growth', playerId, { type: 'free_build', city: 1 })
      break
    case 'robbers_regret': {
      const hexId = targets?.hexId ?? state.robberHexId ?? state.hexes[0]?.id
      const targetPlayerId = targets?.targetPlayerId
      next = { ...next, robberHexId: hexId ?? null }
      if (hexId && targetPlayerId) {
        const { state: afterRemove, stolen } = removeOneRandomResource(next, targetPlayerId)
        next = afterRemove
        if (stolen) next = addResource(next, playerId, stolen, 1)
      }
      break
    }
    default:
      break
  }
  return next
}

/**
 * Play a buff card from hand: remove from hand, add to discard, set hasPlayedOmenThisTurn, apply effect (stub).
 * Returns new state (immutable).
 */
export function playOmenCard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  targets?: PlayOmenTargets
): GameState {
  if (!canPlayOmenCard(state, playerId, cardId, targets)) return state
  const playerIndex = state.players.findIndex(p => p.id === playerId)
  const player = state.players[playerIndex]
  const hand = [...(player.omensHand ?? [])]
  const cardIndex = hand.indexOf(cardId)
  if (cardIndex < 0) return state
  hand.splice(cardIndex, 1)
  const newDiscard = [...(state.omensDiscardPile ?? []), cardId]
  const newPlayers = [...state.players]
  newPlayers[playerIndex] = {
    ...player,
    omensHand: hand,
    hasPlayedOmenThisTurn: true,
  }
  let result: GameState = {
    ...state,
    omensDiscardPile: newDiscard,
    players: newPlayers,
  }
  result = applyBuffEffect(result, cardId, playerId, targets)
  result = appendGameLog(result, {
    type: 'omen_play',
    message: `Player ${playerId} played ${getOmenCardName(cardId)}`,
    playerId,
  })
  return result
}

/** Effective build cost after Omens cost modifiers (road/settlement/city). Returns base cost when Omens disabled. Free-build effects return 0. */
export function getEffectiveBuildCost(
  state: GameState,
  playerId: PlayerId,
  structure: 'road' | 'settlement' | 'city'
): Partial<Record<Terrain, number>> {
  const base: Partial<Record<Terrain, number>> =
    structure === 'road'
      ? { wood: 1, brick: 1 }
      : structure === 'settlement'
        ? { wood: 1, brick: 1, sheep: 1, wheat: 1 }
        : { wheat: 2, ore: 3 }
  if (!isOmensEnabled(state)) return base
  const effects = state.activeOmensEffects ?? []
  const playerEffects = effects.filter(e => e.playerId === playerId)
  for (const e of playerEffects) {
    if (e.appliedEffect?.type === 'free_build') {
      if (structure === 'road' && ((e.appliedEffect.road as number) ?? 0) > 0) return {}
      if (structure === 'settlement' && ((e.appliedEffect.settlement as number) ?? 0) > 0) return {}
      if (structure === 'city' && ((e.appliedEffect.city as number) ?? 0) > 0) return {}
    }
  }
  let cost = { ...base }
  for (const e of playerEffects) {
    const a = e.appliedEffect
    if (a?.type !== 'cost_mod') continue
    if (a.structure === structure) {
      // override replaces the cost (e.g. Strategic Settlement Spot: 1 Wood, 1 Brick only)
      if (a.override) cost = { ...(a.override as Partial<Record<Terrain, number>>) }
      if (a.wood !== undefined) cost.wood = (cost.wood ?? 0) + (a.wood as number)
      if (a.brick !== undefined) cost.brick = (cost.brick ?? 0) + (a.brick as number)
      if (a.sheep !== undefined) cost.sheep = (cost.sheep ?? 0) + (a.sheep as number)
      if (a.discount === 'wood') cost.wood = Math.max(0, (cost.wood ?? 0) - 1)
      if (a.discount === 'brick') cost.brick = Math.max(0, (cost.brick ?? 0) - 1)
    }
  }
  return cost
}

/** Which cards (by cardId) are increasing each resource's build cost for a player. Used for UI asterisk + tooltip. */
export function getBuildCostDebuffSources(
  state: GameState,
  playerId: PlayerId
): { road: Partial<Record<Terrain, string[]>>; settlement: Partial<Record<Terrain, string[]>>; city: Partial<Record<Terrain, string[]>> } {
  const out = {
    road: {} as Partial<Record<Terrain, string[]>>,
    settlement: {} as Partial<Record<Terrain, string[]>>,
    city: {} as Partial<Record<Terrain, string[]>>,
  }
  if (!isOmensEnabled(state)) return out
  const effects = state.activeOmensEffects ?? []
  const playerEffects = effects.filter(e => e.playerId === playerId)
  for (const e of playerEffects) {
    const a = e.appliedEffect
    if (a?.type !== 'cost_mod') continue
    const structure = a.structure as 'road' | 'settlement' | 'city'
    const map = out[structure]
    if ((a.wood as number) > 0) (map.wood = map.wood ?? []).push(e.cardId)
    if ((a.brick as number) > 0) (map.brick = map.brick ?? []).push(e.cardId)
    if ((a.sheep as number) > 0) (map.sheep = map.sheep ?? []).push(e.cardId)
    if ((a.wheat as number) > 0) (map.wheat = map.wheat ?? []).push(e.cardId)
    if ((a.ore as number) > 0) (map.ore = map.ore ?? []).push(e.cardId)
  }
  return out
}

/** Consume one-use cost effects after building (sturdy_wagon_wheel, strategic_settlement_spot, worn_out_tool, broken_wagon_axle). */
export function consumeCostEffectAfterBuild(
  state: GameState,
  playerId: PlayerId,
  structure: 'road' | 'settlement' | 'city'
): GameState {
  if (!isOmensEnabled(state)) return state
  const effects = state.activeOmensEffects ?? []
  const oneUseCostCards = ['sturdy_wagon_wheel', 'strategic_settlement_spot', 'worn_out_tool', 'broken_wagon_axle']
  const i = effects.findIndex(
    e =>
      e.playerId === playerId &&
      oneUseCostCards.includes(e.cardId) &&
      e.appliedEffect?.structure === structure
  )
  if (i < 0) return state
  const nextEffects = effects.slice(0, i).concat(effects.slice(i + 1))
  return { ...state, activeOmensEffects: nextEffects }
}

/** Consume free-build effect after placing (master_builders_plan road/settlement, boomtown_growth city). */
export function consumeFreeBuildEffect(
  state: GameState,
  playerId: PlayerId,
  built: 'road' | 'settlement' | 'city'
): GameState {
  if (!isOmensEnabled(state)) return state
  const effects = state.activeOmensEffects ?? []
  const i = effects.findIndex(ef => {
    if (ef.playerId !== playerId || ef.appliedEffect?.type !== 'free_build') return false
    if (built === 'road' && ((ef.appliedEffect.road as number) ?? 0) > 0) return true
    if (built === 'settlement' && ((ef.appliedEffect.settlement as number) ?? 0) > 0) return true
    if (built === 'city' && ((ef.appliedEffect.city as number) ?? 0) > 0) return true
    return false
  })
  if (i < 0) return state
  const eff = effects[i]
  const applied = { ...eff.appliedEffect }
  if (built === 'road') applied.road = Math.max(0, ((applied.road as number) ?? 0) - 1)
  if (built === 'settlement') applied.settlement = Math.max(0, ((applied.settlement as number) ?? 0) - 1)
  if (built === 'city') applied.city = Math.max(0, ((applied.city as number) ?? 0) - 1)
  const stillHas = ((applied.road as number) ?? 0) > 0 || ((applied.settlement as number) ?? 0) > 0 || ((applied.city as number) ?? 0) > 0
  const nextEffects = stillHas
    ? effects.slice(0, i).concat([{ ...eff, appliedEffect: applied }], effects.slice(i + 1))
    : effects.slice(0, i).concat(effects.slice(i + 1))
  return { ...state, activeOmensEffects: nextEffects }
}

/** True if player can build this turn (not blocked by Wagon Overturned). */
export function canBuildThisTurn(state: GameState, playerId: PlayerId): boolean {
  if (!isOmensEnabled(state)) return true
  const effects = state.activeOmensEffects ?? []
  return !effects.some(
    e => e.playerId === playerId && e.cardId === 'wagon_overturned' && (e.turnsRemaining ?? 0) > 0
  )
}

/** Active effects for a given player (for UI). */
export function getActiveEffectsForPlayer(state: GameState, playerId: PlayerId): ActiveOmenEffect[] {
  if (!isOmensEnabled(state)) return []
  return (state.activeOmensEffects ?? []).filter(e => e.playerId === playerId)
}

/** Human-readable short description of an active effect (for UI list). */
export function getActiveEffectDescription(effect: { cardId: string; turnsRemaining?: number; rollsRemaining?: number; appliedEffect: Record<string, unknown>; triggerCondition?: string }): string {
  const name = getOmenCardName(effect.cardId)
  const tr = effect.turnsRemaining ?? 0
  const rr = effect.rollsRemaining ?? 0
  const a = effect.appliedEffect
  if (a?.type === 'cost_mod') {
    const struct = a.structure as string
    if (a.discount === 'wood') return `${name}: next road −1 Wood`
    if (a.discount === 'brick') return `${name}: next road −1 Brick`
    if (a.override && struct === 'settlement') return `${name}: next settlement costs 1 Wood, 1 Brick`
    if (a.sheep === 1) return `${name}: next settlement +1 Sheep`
    if (a.wood === 1) return `${name}: next road +1 Wood`
  }
  if (a?.type === 'cannot_build') return `${name}: cannot build this turn`
  if (a?.type === 'free_build') {
    const parts: string[] = []
    if ((a.road as number) > 0) parts.push('free road')
    if ((a.settlement as number) > 0) parts.push('free settlement')
    if ((a.city as number) > 0) parts.push('free city')
    return `${name}: ${parts.join(', ')}`
  }
  if (a?.type === 'road_no_adjacency') return `${name}: next road (no adjacency)${tr > 0 ? ` (${tr} turn)` : ''}`
  if (a?.type === 'production_bonus') return `${name}: +1 next roll${rr > 0 ? ` (${rr} roll)` : ''}`
  if (a?.type === 'production_mod' && (a.sheep as number) > 0) return `${name}: Sheep +1${rr > 0 ? ` (${rr} rolls)` : ''}`
  if (a?.type === 'production_mod' && ((a.wood as number) < 0 || (a.wheat as number) < 0)) return `${name}: production −1${rr > 0 ? ` (${rr} roll)` : ''}`
  if (a?.type === 'no_wheat_production') return `${name}: no Wheat${rr > 0 ? ` (${rr} rolls)` : ''}`
  if (a?.type === 'production_halt') return `${name}: no production${rr > 0 ? ` (${rr} roll)` : ''}`
  if (a?.type === 'trade_worse') return `${name}: worse trade${(a.tradesLeft as number) > 0 ? ` (${a.tradesLeft} left)` : ''}`
  if (a?.type === 'one_time_2_1') return `${name}: next trade 2:1`
  if (a?.type === 'negate_one_loss' || effect.triggerCondition === 'on_resource_loss') return `${name}: negate next loss`
  if (tr > 0) return `${name} (${tr} turn${tr !== 1 ? 's' : ''})`
  if (rr > 0) return `${name} (${rr} roll${rr !== 1 ? 's' : ''})`
  return name
}

/** True if Pathfinder's Insight is active (next road ignores adjacency). */
export function roadIgnoresAdjacencyThisTurn(state: GameState, playerId: PlayerId): boolean {
  if (!isOmensEnabled(state)) return false
  const effects = state.activeOmensEffects ?? []
  return effects.some(
    e =>
      e.playerId === playerId &&
      e.cardId === 'pathfinders_insight' &&
      (e.turnsRemaining ?? 0) > 0
  )
}

/** Decrement turnsRemaining for active effects; remove expired. Call at start of each player's turn. */
export function tickActiveOmensEffects(state: GameState, event: 'turn_start' | 'roll'): GameState {
  if (!isOmensEnabled(state)) return state
  const effects = state.activeOmensEffects ?? []
  const nextEffects = effects
    .map(e => {
      if (event === 'turn_start' && e.turnsRemaining != null) {
        const tr = e.turnsRemaining - 1
        if (tr <= 0) return null
        return { ...e, turnsRemaining: tr }
      }
      if (event === 'roll' && e.rollsRemaining != null) {
        const rr = e.rollsRemaining - 1
        if (rr <= 0) return null
        return { ...e, rollsRemaining: rr }
      }
      return e
    })
    .filter((e): e is NonNullable<typeof e> => e != null)
  return { ...state, activeOmensEffects: nextEffects }
}

/** Apply production modifiers (Reliable Harvest +1, Bountiful Pastures +1 sheep, Drought/Confusing Tracks/Dysentery/Famine). Call after distributeResources. */
export function applyProductionModifiersAfterRoll(state: GameState, dice: number): GameState {
  if (!isOmensEnabled(state)) return state
  const effects = state.activeOmensEffects ?? []
  let next = state
  for (const e of effects) {
    if (e.appliedEffect?.type === 'production_bonus' && (e.rollsRemaining ?? 0) > 0) {
      const hexId = e.appliedEffect.hexId as string
      const hex = next.hexes.find(h => h.id === hexId)
      if (hex && hex.terrain !== 'desert' && hex.number === dice) {
        const verts = (Object.values(next.vertices) as { id: string; hexIds?: string[] }[]).filter(
          v => v.hexIds?.includes(hexId)
        )
        for (const v of verts) {
          const struct = next.vertices[v.id]?.structure
          if (struct?.player === e.playerId) next = addResource(next, e.playerId, hex.terrain, 1)
        }
      }
    }
    if (e.appliedEffect?.type === 'production_mod' && (e.rollsRemaining ?? 0) > 0) {
      const sheepBonus = (e.appliedEffect.sheep as number) ?? 0
      if (sheepBonus > 0) {
        const sheepHexes = next.hexes.filter(h => h.terrain === 'sheep' && h.number === dice && h.id !== next.robberHexId)
        for (const h of sheepHexes) {
          const verts = (Object.values(next.vertices) as { id: string; hexIds?: string[] }[]).filter(
            v => v.hexIds?.includes(h.id)
          )
          for (const v of verts) {
            if (next.vertices[v.id]?.structure?.player === e.playerId)
              next = addResource(next, e.playerId, 'sheep', sheepBonus)
          }
        }
      }
      const woodPenalty = (e.appliedEffect.wood as number) ?? 0
      if (woodPenalty < 0) next = removeResourceWithPantryCheck(next, e.playerId, 'wood', 1).state
      const wheatPenalty = (e.appliedEffect.wheat as number) ?? 0
      if (wheatPenalty < 0) next = removeResourceWithPantryCheck(next, e.playerId, 'wheat', 1).state
    }
    if (e.appliedEffect?.type === 'no_wheat_production' && (e.rollsRemaining ?? 0) > 0) {
      const flash = next.lastResourceFlash ?? {}
      const playerIndex = next.players.findIndex(p => p.id === e.playerId)
      if (playerIndex >= 0) {
        const terrains = flash[playerIndex] ?? []
        const wheatCount = terrains.filter(t => t === 'wheat').length
        if (wheatCount > 0) next = removeResourceWithPantryCheck(next, e.playerId, 'wheat', wheatCount).state
      }
    }
    if (e.appliedEffect?.type === 'production_halt' && (e.rollsRemaining ?? 0) > 0) {
      const flash = next.lastResourceFlash ?? {}
      const playerIndex = next.players.findIndex(p => p.id === e.playerId)
      if (playerIndex >= 0) {
        const terrains = flash[playerIndex] ?? []
        for (const t of terrains) next = removeResourceWithPantryCheck(next, e.playerId, t, 1).state
      }
    }
  }
  next = tickActiveOmensEffects(next, 'roll')
  return next
}

/** Effective trade rate (2/3/4). Friendly Trade Caravan gives one-time 2:1; Poor Trade Season makes next 2 trades worse. */
export function getEffectiveTradeRate(
  state: GameState,
  playerId: PlayerId,
  giveResource: Terrain,
  baseRate: number
): { rate: number; stateAfterTrade?: GameState } {
  if (!isOmensEnabled(state)) return { rate: baseRate }
  const effects = state.activeOmensEffects ?? []
  const friendly = effects.find(
    e => e.playerId === playerId && e.cardId === 'friendly_trade_caravan' && e.appliedEffect?.type === 'one_time_2_1'
  )
  if (friendly) {
    const idx = effects.indexOf(friendly)
    const nextEffects = effects.slice(0, idx).concat(effects.slice(idx + 1))
    return { rate: 2, stateAfterTrade: { ...state, activeOmensEffects: nextEffects } }
  }
  const poor = effects.find(
    e =>
      e.playerId === playerId &&
      e.cardId === 'poor_trade_season' &&
      ((e.appliedEffect?.tradesLeft as number) ?? 0) > 0
  )
  if (poor) {
    const worse = Math.min(4, baseRate + 1)
    const tradesLeft = (poor.appliedEffect?.tradesLeft as number) ?? 0
    if (tradesLeft <= 1) {
      const i = effects.indexOf(poor)
      const nextEffects = effects.slice(0, i).concat(effects.slice(i + 1))
      return { rate: worse, stateAfterTrade: { ...state, activeOmensEffects: nextEffects } }
    }
    const nextApplied = { ...poor.appliedEffect, tradesLeft: tradesLeft - 1 }
    const nextEffects = effects.map(ee => (ee === poor ? { ...ee, appliedEffect: nextApplied } : ee))
    return { rate: worse, stateAfterTrade: { ...state, activeOmensEffects: nextEffects } }
  }
  return { rate: baseRate }
}

/** Consume Pathfinder's Insight after placing a road (one use). */
export function consumePathfinderEffect(state: GameState, playerId: PlayerId): GameState {
  if (!isOmensEnabled(state)) return state
  const effects = state.activeOmensEffects ?? []
  const i = effects.findIndex(
    e => e.playerId === playerId && e.cardId === 'pathfinders_insight'
  )
  if (i < 0) return state
  const nextEffects = effects.slice(0, i).concat(effects.slice(i + 1))
  return { ...state, activeOmensEffects: nextEffects }
}

/** Reset hasDrawnOmenThisTurn and hasPlayedOmenThisTurn for the given player index. */
export function resetPlayerOmensFlagsForNewTurn(state: GameState, playerIndex: number): GameState {
  if (!isOmensEnabled(state)) return state
  let next = tickActiveOmensEffects(state, 'turn_start')
  const players = [...next.players]
  if (playerIndex < 0 || playerIndex >= players.length) return next
  const p = players[playerIndex]
  if (p.hasDrawnOmenThisTurn === false && p.hasPlayedOmenThisTurn === false) return next
  players[playerIndex] = {
    ...p,
    hasDrawnOmenThisTurn: false,
    hasPlayedOmenThisTurn: false,
  }
  return { ...next, players }
}
