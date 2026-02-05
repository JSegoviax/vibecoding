import type { GameState, Terrain, PlayerId } from './types'
import {
  getPlaceableVertices,
  getPlaceableRoadsForVertex,
  getPlaceableRoads,
  canAfford,
  canAffordWithCost,
  canBuildCity,
  getMissingResources,
  getMissingResourcesWithCost,
  getBuildCost,
  getPlayersOnHex,
  getTradeRate,
} from './logic'
import {
  isOmensEnabled,
  canDrawOmenCard,
  canPlayOmenCard,
  getEffectiveBuildCost,
  canBuildThisTurn,
  roadIgnoresAdjacencyThisTurn,
  getHexesForFarmSwap,
} from './omens'
import type { PlayOmenTargets } from './omens'

const RESOURCE_TYPES: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

const DEFAULT_AI_PLAYER_ID = 2

// Dice probability weights (2 and 12 least likely, 6 and 8 most)
const DICE_WEIGHT: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
}

function scoreVertex(state: GameState, vertexId: string): number {
  const v = state.vertices[vertexId]
  if (!v?.hexIds) return 0
  let score = 0
  const terrains = new Set<string>()
  for (const hid of v.hexIds) {
    const h = state.hexes.find(x => x.id === hid)
    if (!h || h.terrain === 'desert') continue
    terrains.add(h.terrain)
    score += DICE_WEIGHT[h.number ?? 0] ?? 0
  }
  score += terrains.size * 0.5 // bonus for resource diversity
  return score
}

export function runAISetup(state: GameState, aiPlayerId: PlayerId = DEFAULT_AI_PLAYER_ID): { vertexId: string; edgeId: string } {
  const verts = getPlaceableVertices(state)
  if (verts.length === 0) throw new Error('AI: no placeable vertices')

  const best = verts.slice().sort((a, b) => scoreVertex(state, b) - scoreVertex(state, a))[0]
  const edges = getPlaceableRoadsForVertex(state, best, aiPlayerId)
  const edge = edges[Math.floor(Math.random() * edges.length)]
  if (!edge) throw new Error('AI: no placeable road for vertex')
  return { vertexId: best, edgeId: edge }
}

export type AITurnAction =
  | { action: 'end' }
  | { action: 'city'; vertexId: string }
  | { action: 'settlement'; vertexId: string }
  | { action: 'road'; edgeId: string }

function aiCanAfford(state: GameState, structure: 'road' | 'settlement' | 'city', aiPlayerId: PlayerId): boolean {
  const player = state.players[aiPlayerId - 1]
  if (!player) return false
  const cost = isOmensEnabled(state)
    ? getEffectiveBuildCost(state, aiPlayerId, structure)
    : getBuildCost(structure)
  return canAffordWithCost(player, cost)
}

export function runAITurn(state: GameState, aiPlayerId: PlayerId = DEFAULT_AI_PLAYER_ID): AITurnAction {
  const player = state.players[aiPlayerId - 1]
  if (!player) return { action: 'end' }
  if (isOmensEnabled(state) && !canBuildThisTurn(state, aiPlayerId)) return { action: 'end' }

  // 1. Prefer city (2 VP)
  if (aiCanAfford(state, 'city', aiPlayerId) && player.citiesLeft > 0) {
    const vertices = Object.keys(state.vertices).filter(id => canBuildCity(state, id, aiPlayerId))
    if (vertices.length > 0) {
      const best = vertices.sort((a, b) => scoreVertex(state, b) - scoreVertex(state, a))[0]
      return { action: 'city', vertexId: best }
    }
  }

  // 2. Prefer settlement (1 VP + production)
  if (canAfford(player, 'settlement') && player.settlementsLeft > 0) {
    const verts = getPlaceableVertices(state, aiPlayerId).filter(id => canAfford(player, 'settlement'))
    if (verts.length > 0) {
      const best = verts.sort((a, b) => scoreVertex(state, b) - scoreVertex(state, a))[0]
      return { action: 'settlement', vertexId: best }
    }
  }

  // 3. Road to extend network
  if (aiCanAfford(state, 'road', aiPlayerId) && player.roadsLeft > 0) {
    const edges = getPlaceableRoads(state, aiPlayerId, isOmensEnabled(state) && roadIgnoresAdjacencyThisTurn(state, aiPlayerId))
    if (edges.length > 0) {
      const pick = edges[Math.floor(Math.random() * edges.length)]
      return { action: 'road', edgeId: pick }
    }
  }

  return { action: 'end' }
}

export function runAITrade(state: GameState, aiPlayerId: PlayerId = DEFAULT_AI_PLAYER_ID): { give: Terrain; get: Terrain } | null {
  const player = state.players[aiPlayerId - 1]
  if (!player) return null
  const order: ('city' | 'settlement' | 'road')[] = ['city', 'settlement', 'road']
  for (const struct of order) {
    if (struct === 'city' && player.citiesLeft <= 0) continue
    if (struct === 'settlement' && player.settlementsLeft <= 0) continue
    if (struct === 'road' && player.roadsLeft <= 0) continue
    if (aiCanAfford(state, struct, aiPlayerId)) continue
    const cost = isOmensEnabled(state)
      ? getEffectiveBuildCost(state, aiPlayerId, struct)
      : getBuildCost(struct)
    const missing = getMissingResourcesWithCost(player, cost)
    for (const m of missing) {
      // Check all resource types, using harbor rates if available
      const giveOptions = RESOURCE_TYPES.filter(t => {
        if (t === m.terrain) return false
        const tradeRate = getTradeRate(state, aiPlayerId, t)
        return (player.resources[t] || 0) >= tradeRate
      })
      if (giveOptions.length > 0) {
        // Prefer resources with better trade rates (2:1 or 3:1 over 4:1)
        const bestOption = giveOptions.sort((a, b) => {
          const rateA = getTradeRate(state, aiPlayerId, a)
          const rateB = getTradeRate(state, aiPlayerId, b)
          return rateA - rateB // Lower is better (2 < 3 < 4)
        })[0]
        return { give: bestOption, get: m.terrain }
      }
    }
  }
  return null
}

/** AI selects a hex to move the robber to. Prefers hexes with opponent structures. */
export function runAIRobberMove(state: GameState, aiPlayerId: PlayerId = DEFAULT_AI_PLAYER_ID): string {
  const availableHexes = state.hexes.filter(h => h.id !== state.robberHexId)
  
  // Score each hex: prefer hexes with opponent structures, avoid own structures
  const scored = availableHexes.map(h => {
    const playersOnHex = getPlayersOnHex(state, h.id)
    const hasOpponents = Array.from(playersOnHex).some(pid => pid !== aiPlayerId)
    const hasSelf = playersOnHex.has(aiPlayerId)
    let score = 0
    if (hasOpponents) score += 10
    if (hasSelf) score -= 5
    // Prefer hexes with higher dice numbers (more valuable to block)
    if (h.number) {
      score += DICE_WEIGHT[h.number] ?? 0
    }
    return { hexId: h.id, score }
  })
  
  // Pick the best hex, or random if tied
  scored.sort((a, b) => b.score - a.score)
  const bestScore = scored[0]?.score ?? 0
  const bestHexes = scored.filter(s => s.score === bestScore)
  return bestHexes[Math.floor(Math.random() * bestHexes.length)]?.hexId ?? availableHexes[0]?.id ?? ''
}

/** AI selects which player to rob. Prefers players with more resources. */
export function runAISelectPlayerToRob(state: GameState, hexId: string, aiPlayerId: PlayerId = DEFAULT_AI_PLAYER_ID): number | null {
  const playersOnHex = getPlayersOnHex(state, hexId)
  const opponents = Array.from(playersOnHex).filter(pid => pid !== aiPlayerId)
  if (opponents.length === 0) return null

  // Score by total resources
  const scored = opponents.map(pid => {
    const p = state.players[pid - 1]
    if (!p) return { pid, score: 0 }
    const total = (p.resources.wood || 0) + (p.resources.brick || 0) + (p.resources.sheep || 0) + (p.resources.wheat || 0) + (p.resources.ore || 0)
    return { pid, score: total }
  })

  scored.sort((a, b) => b.score - a.score)
  const bestScore = scored[0]?.score ?? 0
  const bestPlayers = scored.filter(s => s.score === bestScore && s.score > 0)
  if (bestPlayers.length === 0) return null
  return bestPlayers[Math.floor(Math.random() * bestPlayers.length)]?.pid ?? null
}

// ——— Oregon's Omens: AI draw and play ———

/** Whether spending 1W+1S+1O on an Omen would delay a build we're close to. Skip draw when it's better to save for settlement/city. */
function aiCloseToBuild(state: GameState, aiPlayerId: PlayerId): boolean {
  const player = state.players[aiPlayerId - 1]
  if (!player) return false
  const settlementCost = isOmensEnabled(state)
    ? getEffectiveBuildCost(state, aiPlayerId, 'settlement')
    : getBuildCost('settlement')
  const cityCost = isOmensEnabled(state)
    ? getEffectiveBuildCost(state, aiPlayerId, 'city')
    : getBuildCost('city')

  const missingSettlement = getMissingResourcesWithCost(player, settlementCost)
  const missingCity = getMissingResourcesWithCost(player, cityCost)

  // One resource short of settlement and it's wheat or sheep (Omen cost uses both) → hold off
  if (player.settlementsLeft > 0 && missingSettlement.length === 1) {
    const t = missingSettlement[0].terrain
    if (t === 'wheat' || t === 'sheep') return true
  }
  if (player.settlementsLeft > 0 && missingSettlement.length === 2) {
    const terrains = new Set(missingSettlement.map(m => m.terrain))
    if (terrains.has('wheat') || terrains.has('sheep')) return true
  }

  // One or two short of city; Omen uses 1 wheat + 1 ore → hold off if we're missing wheat or ore
  if (player.citiesLeft > 0 && missingCity.length >= 1) {
    const terrains = new Set(missingCity.map(m => m.terrain))
    if (terrains.has('wheat') || terrains.has('ore')) return true
  }

  return false
}

/** Whether the AI should draw an Omen card this turn. Avoids drawing when close to 10 VP (risk of debuff) or when close to a key build. */
export function runAIDrawOmen(state: GameState, aiPlayerId: PlayerId = DEFAULT_AI_PLAYER_ID): boolean {
  if (!isOmensEnabled(state) || !canDrawOmenCard(state, aiPlayerId)) return false
  const player = state.players[aiPlayerId - 1]
  if (!player) return false
  // Avoid drawing when at 8+ VP to reduce risk of game-losing debuff (e.g. Smallpox, Mass Exodus)
  if (player.victoryPoints >= 8) return false
  // Prefer building over drawing when we can afford a settlement or city this turn
  if (aiCanAfford(state, 'settlement', aiPlayerId) && player.settlementsLeft > 0 && getPlaceableVertices(state, aiPlayerId).length > 0) return false
  if (aiCanAfford(state, 'city', aiPlayerId) && player.citiesLeft > 0 && Object.keys(state.vertices).some(id => canBuildCity(state, id, aiPlayerId))) return false
  // Hold off when we're one or two resources away from settlement/city and Omen cost would delay that build
  if (aiCloseToBuild(state, aiPlayerId)) return false
  return true
}

export type AIPlayOmenResult = { cardId: string; targets?: PlayOmenTargets } | null

/** Which Omen card to play this turn (priority: VP win, cost reducers, resources, robber, production). Returns null if none. */
export function runAIPlayOmen(state: GameState, aiPlayerId: PlayerId = DEFAULT_AI_PLAYER_ID): AIPlayOmenResult {
  if (!isOmensEnabled(state)) return null
  const player = state.players[aiPlayerId - 1]
  if (!player || player.hasPlayedOmenThisTurn) return null
  const hand = player.omensHand ?? []
  if (hand.length === 0) return null

  const vp = player.victoryPoints ?? 0

  // 1. Manifest Destiny if it wins the game
  if (hand.includes('manifest_destiny') && vp + 2 >= 10 && canPlayOmenCard(state, aiPlayerId, 'manifest_destiny')) {
    return { cardId: 'manifest_destiny' }
  }

  // 2. Cost reducers (strategic settlement, master builder, boomtown) when we can use them
  if (hand.includes('strategic_settlement_spot') && player.settlementsLeft > 0 && canPlayOmenCard(state, aiPlayerId, 'strategic_settlement_spot')) {
    return { cardId: 'strategic_settlement_spot' }
  }
  if (hand.includes('master_builders_plan') && player.settlementsLeft > 0 && player.roadsLeft > 0 && canPlayOmenCard(state, aiPlayerId, 'master_builders_plan')) {
    return { cardId: 'master_builders_plan' }
  }
  if (hand.includes('boomtown_growth') && player.settlementsLeft < 5 && canPlayOmenCard(state, aiPlayerId, 'boomtown_growth')) {
    return { cardId: 'boomtown_growth' }
  }

  // 3. Resource gains (immediate value)
  const resourceCards = ['foragers_bounty', 'skilled_prospector', 'hidden_cache', 'gold_rush'] as const
  for (const cardId of resourceCards) {
    if (hand.includes(cardId) && canPlayOmenCard(state, aiPlayerId, cardId)) {
      return { cardId }
    }
  }

  // 4. Robber's Regret: pick best hex and target (opponent with resources)
  if (hand.includes('robbers_regret') && canPlayOmenCard(state, aiPlayerId, 'robbers_regret')) {
    const hexId = runAIRobberMove(state, aiPlayerId)
    const targetPlayerId = runAISelectPlayerToRob(state, hexId, aiPlayerId)
    return { cardId: 'robbers_regret', targets: { hexId, targetPlayerId: (targetPlayerId ?? undefined) as PlayerId | undefined } }
  }

  // 5. Production boosts (reliable harvest, bountiful pastures)
  if (hand.includes('reliable_harvest') && canPlayOmenCard(state, aiPlayerId, 'reliable_harvest')) {
    const hexWithProd = state.hexes.find(h => h.terrain !== 'desert' && h.number != null)
    return { cardId: 'reliable_harvest', targets: { hexIdForHarvest: hexWithProd?.id } }
  }
  if (hand.includes('bountiful_pastures') && canPlayOmenCard(state, aiPlayerId, 'bountiful_pastures')) {
    return { cardId: 'bountiful_pastures' }
  }

  // 7. Other buffs (sturdy wheel, pantry, trade caravan, pathfinder)
  const otherBuffs = ['sturdy_wagon_wheel', 'well_stocked_pantry', 'friendly_trade_caravan', 'pathfinders_insight'] as const
  for (const cardId of otherBuffs) {
    if (hand.includes(cardId) && canPlayOmenCard(state, aiPlayerId, cardId)) {
      return { cardId }
    }
  }

  return null
}
