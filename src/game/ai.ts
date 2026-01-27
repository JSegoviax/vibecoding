import type { GameState, Terrain } from './types'
import {
  getPlaceableVertices,
  getPlaceableRoadsForVertex,
  getPlaceableRoads,
  canAfford,
  canBuildCity,
  getMissingResources,
  getPlayersOnHex,
} from './logic'

const RESOURCE_TYPES: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

const AI_PLAYER_ID = 2

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

export function runAISetup(state: GameState): { vertexId: string; edgeId: string } {
  const verts = getPlaceableVertices(state)
  if (verts.length === 0) throw new Error('AI: no placeable vertices')

  const best = verts.slice().sort((a, b) => scoreVertex(state, b) - scoreVertex(state, a))[0]
  const edges = getPlaceableRoadsForVertex(state, best, AI_PLAYER_ID)
  const edge = edges[Math.floor(Math.random() * edges.length)]
  if (!edge) throw new Error('AI: no placeable road for vertex')
  return { vertexId: best, edgeId: edge }
}

export type AITurnAction =
  | { action: 'end' }
  | { action: 'city'; vertexId: string }
  | { action: 'settlement'; vertexId: string }
  | { action: 'road'; edgeId: string }

export function runAITurn(state: GameState): AITurnAction {
  const player = state.players[AI_PLAYER_ID - 1]
  if (!player) return { action: 'end' }

  // 1. Prefer city (2 VP)
  if (canAfford(player, 'city') && player.citiesLeft > 0) {
    const vertices = Object.keys(state.vertices).filter(id => canBuildCity(state, id, AI_PLAYER_ID))
    if (vertices.length > 0) {
      const best = vertices.sort((a, b) => scoreVertex(state, b) - scoreVertex(state, a))[0]
      return { action: 'city', vertexId: best }
    }
  }

  // 2. Prefer settlement (1 VP + production)
  if (canAfford(player, 'settlement') && player.settlementsLeft > 0) {
    const verts = getPlaceableVertices(state, AI_PLAYER_ID).filter(id => canAfford(player, 'settlement'))
    if (verts.length > 0) {
      const best = verts.sort((a, b) => scoreVertex(state, b) - scoreVertex(state, a))[0]
      return { action: 'settlement', vertexId: best }
    }
  }

  // 3. Road to extend network
  if (canAfford(player, 'road') && player.roadsLeft > 0) {
    const edges = getPlaceableRoads(state, AI_PLAYER_ID)
    if (edges.length > 0) {
      const pick = edges[Math.floor(Math.random() * edges.length)]
      return { action: 'road', edgeId: pick }
    }
  }

  return { action: 'end' }
}

export function runAITrade(state: GameState): { give: Terrain; get: Terrain } | null {
  const player = state.players[AI_PLAYER_ID - 1]
  if (!player) return null
  const order: ('city' | 'settlement' | 'road')[] = ['city', 'settlement', 'road']
  for (const struct of order) {
    if (struct === 'city' && player.citiesLeft <= 0) continue
    if (struct === 'settlement' && player.settlementsLeft <= 0) continue
    if (struct === 'road' && player.roadsLeft <= 0) continue
    if (canAfford(player, struct)) continue
    const missing = getMissingResources(player, struct)
    for (const m of missing) {
      const giveOptions = RESOURCE_TYPES.filter(t => t !== m.terrain && (player.resources[t] || 0) >= 4)
      if (giveOptions.length > 0) return { give: giveOptions[0], get: m.terrain }
    }
  }
  return null
}

/** AI selects a hex to move the robber to. Prefers hexes with opponent structures. */
export function runAIRobberMove(state: GameState): string {
  const availableHexes = state.hexes.filter(h => h.id !== state.robberHexId)
  
  // Score each hex: prefer hexes with opponent structures, avoid own structures
  const scored = availableHexes.map(h => {
    const playersOnHex = getPlayersOnHex(state, h.id)
    const hasOpponents = Array.from(playersOnHex).some(pid => pid !== AI_PLAYER_ID)
    const hasSelf = playersOnHex.has(AI_PLAYER_ID)
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
export function runAISelectPlayerToRob(state: GameState, hexId: string): number | null {
  const playersOnHex = getPlayersOnHex(state, hexId)
  const opponents = Array.from(playersOnHex).filter(pid => pid !== AI_PLAYER_ID)
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
