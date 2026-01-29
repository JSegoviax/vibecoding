import type { GameState, Terrain, PlayerId, HarborType } from './types'

function getEdgesForVertex(edges: Record<string, { v1: string; v2: string }>, vid: string): string[] {
  return Object.entries(edges)
    .filter(([, e]) => e.v1 === vid || e.v2 === vid)
    .map(([id]) => id)
}

function getNeighborVertices(edges: Record<string, { v1: string; v2: string }>, vid: string): string[] {
  return Object.values(edges)
    .filter(e => e.v1 === vid || e.v2 === vid)
    .map(e => (e.v1 === vid ? e.v2 : e.v1))
}

function isWithinTwoEdges(
  edges: Record<string, { v1: string; v2: string }>,
  from: string,
  to: string,
  maxSteps: number = 2
): boolean {
  const seen = new Set<string>()
  let depth = 0
  const queue: [string, number][] = [[from, 0]]
  while (queue.length) {
    const [v, d] = queue.shift()!
    if (v === to) return d <= maxSteps
    if (seen.has(v) || d > maxSteps) continue
    seen.add(v)
    for (const n of getNeighborVertices(edges, v)) {
      if (!seen.has(n)) queue.push([n, d + 1])
    }
  }
  return false
}

export function canPlaceSettlement(state: GameState, vertexId: string, playerId?: number): boolean {
  const v = state.vertices[vertexId]
  if (!v || v.structure) return false

  // No other settlement within 2 edges
  for (const o of Object.values(state.vertices)) {
    if (!o.structure) continue
    if (isWithinTwoEdges(state.edges as Record<string, { v1: string; v2: string }>, vertexId, o.id, 2))
      return false
  }

  // In playing phase: must have a road of this player attached to the vertex
  if (state.phase === 'playing' && playerId != null) {
    const incidentEdges = getEdgesForVertex(state.edges as Record<string, { v1: string; v2: string }>, vertexId)
    if (!incidentEdges.some(eid => state.edges[eid]?.road === playerId)) return false
  }

  return true
}

export function canPlaceRoad(state: GameState, edgeId: string, playerId: number): boolean {
  const e = state.edges[edgeId]
  if (!e || e.road) return false

  const isSetup = state.phase === 'setup'
  const player = state.players[playerId - 1]
  if (!player) return false

  if (isSetup) {
    // In setup, road must be adjacent to the settlement just placed.
    // We don't have "just placed" in state; we'll require the road to touch a settlement of this player.
    const [v1, v2] = [e.v1, e.v2]
    const s1 = state.vertices[v1]?.structure
    const s2 = state.vertices[v2]?.structure
    return (s1?.player === playerId || s2?.player === playerId)
  }

  // In play: must be adjacent to your road or settlement
  const [va, vb] = [e.v1, e.v2]
  const hasMySettlement =
    state.vertices[va]?.structure?.player === playerId ||
    state.vertices[vb]?.structure?.player === playerId
  const adjEdges = [
    ...getEdgesForVertex(state.edges as Record<string, { v1: string; v2: string }>, va),
    ...getEdgesForVertex(state.edges as Record<string, { v1: string; v2: string }>, vb),
  ].filter(id => id !== edgeId)
  const hasMyRoadAdj = adjEdges.some(eid => state.edges[eid]?.road === playerId)
  return hasMySettlement || hasMyRoadAdj
}

export function canPlaceRoadInSetup(state: GameState, edgeId: string, playerId: number, justPlacedVertex: string): boolean {
  const e = state.edges[edgeId]
  if (!e || e.road) return false
  return (e.v1 === justPlacedVertex || e.v2 === justPlacedVertex)
}

export function getPlaceableVertices(state: GameState, playerId?: number): string[] {
  return Object.keys(state.vertices).filter(id => canPlaceSettlement(state, id, playerId))
}

export function getPlaceableRoadsForVertex(state: GameState, vertexId: string, playerId: number): string[] {
  const edgeIds = getEdgesForVertex(state.edges as Record<string, { v1: string; v2: string }>, vertexId)
  return edgeIds.filter(eid => {
    const e = state.edges[eid]
    return e && !e.road && canPlaceRoadInSetup(state, eid, playerId, vertexId)
  })
}

export function getPlaceableRoads(state: GameState, playerId: number): string[] {
  return Object.keys(state.edges).filter(id => canPlaceRoad(state, id, playerId))
}

export function canBuildCity(state: GameState, vertexId: string, playerId: number): boolean {
  const v = state.vertices[vertexId]
  return !!(v?.structure?.player === playerId && v.structure.type === 'settlement')
}

export function payResources(hexId: string, terrain: Terrain, vertexIds: string[], state: GameState): { playerId: number; terrain: Terrain }[] {
  if (terrain === 'desert') return []
  const gains: { playerId: number; terrain: Terrain }[] = []
  for (const vid of vertexIds) {
    const v = state.vertices[vid]
    if (!v?.structure) continue
    const pid = v.structure.player
    const ply = state.players[pid - 1]
    if (!ply) continue
    const count = v.structure.type === 'city' ? 2 : 1
    ply.resources[terrain] = (ply.resources[terrain] || 0) + count
    gains.push({ playerId: pid, terrain })
  }
  return gains
}

/** Distributes resources for dice roll; returns per–player-index list of terrains that gained (for UI flash). */
export function distributeResources(state: GameState, dice: number): Record<number, Terrain[]> {
  const all: { playerId: number; terrain: Terrain }[] = []
  for (const h of state.hexes) {
    if (h.terrain === 'desert' || h.number !== dice) continue
    const verts = (Object.values(state.vertices) as { id: string; hexIds?: string[] }[]).filter(v => v.hexIds?.includes(h.id)).map(v => v.id)
    all.push(...payResources(h.id, h.terrain, verts, state))
  }
  const byPlayer: Record<number, Terrain[]> = {}
  for (const { playerId, terrain } of all) {
    const idx = playerId - 1
    if (!byPlayer[idx]) byPlayer[idx] = []
    if (!byPlayer[idx].includes(terrain)) byPlayer[idx].push(terrain)
  }
  return byPlayer
}

export function getBuildCost(structure: 'road' | 'settlement' | 'city'): Partial<Record<Terrain, number>> {
  switch (structure) {
    case 'road': return { wood: 1, brick: 1 }
    case 'settlement': return { wood: 1, brick: 1, sheep: 1, wheat: 1 }
    case 'city': return { wheat: 2, ore: 3 }
    default: return {}
  }
}

export function canAfford(player: { resources: Record<Terrain, number> }, structure: 'road' | 'settlement' | 'city'): boolean {
  const cost = getBuildCost(structure)
  for (const [t, n] of Object.entries(cost)) {
    if ((player.resources[t as Terrain] || 0) < n!) return false
  }
  return true
}

export function getMissingResources(
  player: { resources: Record<Terrain, number> },
  structure: 'road' | 'settlement' | 'city'
): { terrain: Terrain; need: number }[] {
  const cost = getBuildCost(structure)
  const out: { terrain: Terrain; need: number }[] = []
  for (const [t, n] of Object.entries(cost)) {
    const need = n! - (player.resources[t as Terrain] || 0)
    if (need > 0) out.push({ terrain: t as Terrain, need })
  }
  return out
}


export function giveInitialResources(state: GameState, vertexId: string): void {
  const v = state.vertices[vertexId]
  if (!v?.structure) return
  const pid = v.structure.player
  const ply = state.players[pid - 1]
  if (!ply) return
  for (const hid of v.hexIds) {
    const h = state.hexes.find(x => x.id === hid)
    if (h && h.terrain !== 'desert') {
      ply.resources[h.terrain] = (ply.resources[h.terrain] || 0) + 1
    }
  }
}

/** Returns set of player IDs who have structures on the given hex */
export function getPlayersOnHex(state: GameState, hexId: string): Set<number> {
  const players = new Set<number>()
  const hex = state.hexes.find(h => h.id === hexId)
  if (!hex) return players

  // Find all vertices that belong to this hex
  for (const v of Object.values(state.vertices)) {
    if (v.hexIds?.includes(hexId) && v.structure) {
      players.add(v.structure.player)
    }
  }
  return players
}

/** Steals a random resource from the target player and gives it to the robbing player */
export function stealResource(state: GameState, robbingPlayerId: number, targetPlayerId: number): Terrain | null {
  const targetPlayer = state.players[targetPlayerId - 1]
  const robbingPlayer = state.players[robbingPlayerId - 1]
  if (!targetPlayer || !robbingPlayer) return null

  // Get all resources the target player has (excluding desert)
  const resourceTypes: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']
  const availableResources: Terrain[] = []
  for (const res of resourceTypes) {
    const count = targetPlayer.resources[res] || 0
    for (let i = 0; i < count; i++) {
      availableResources.push(res)
    }
  }

  if (availableResources.length === 0) return null

  // Pick a random resource
  const stolen = availableResources[Math.floor(Math.random() * availableResources.length)]

  // Transfer the resource
  targetPlayer.resources[stolen] = Math.max(0, (targetPlayer.resources[stolen] || 0) - 1)
  robbingPlayer.resources[stolen] = (robbingPlayer.resources[stolen] || 0) + 1

  return stolen
}

/** Calculate the longest continuous road for a player */
export function calculateLongestRoad(state: GameState, playerId: number): number {
  // Get all edges owned by this player
  const playerEdges = Object.entries(state.edges)
    .filter(([, e]) => e.road === playerId)
    .map(([id]) => id)

  if (playerEdges.length === 0) return 0

  // Build adjacency: for each vertex, which edges connect to it
  const vertexToEdges = new Map<string, string[]>()
  for (const eid of playerEdges) {
    const e = state.edges[eid]
    if (!e) continue
    if (!vertexToEdges.has(e.v1)) vertexToEdges.set(e.v1, [])
    if (!vertexToEdges.has(e.v2)) vertexToEdges.set(e.v2, [])
    vertexToEdges.get(e.v1)!.push(eid)
    vertexToEdges.get(e.v2)!.push(eid)
  }

  // Find connected components using DFS
  const visited = new Set<string>()
  let maxLength = 0

  for (const startEdge of playerEdges) {
    if (visited.has(startEdge)) continue

    // DFS to find all edges in this component
    const component = new Set<string>()
    const stack = [startEdge]
    while (stack.length) {
      const eid = stack.pop()!
      if (visited.has(eid)) continue
      visited.add(eid)
      component.add(eid)

      const e = state.edges[eid]
      if (!e) continue

      // Add adjacent edges through vertices
      for (const vid of [e.v1, e.v2]) {
        const adjEdges = vertexToEdges.get(vid) || []
        for (const adjEid of adjEdges) {
          if (!visited.has(adjEid) && !component.has(adjEid)) {
            stack.push(adjEid)
          }
        }
      }
    }

    // Find longest path in this component
    // Use DFS from each edge to find longest path
    const componentEdges = Array.from(component)
    let componentMax = 0

    for (const start of componentEdges) {
      const pathLength = findLongestPathFromEdge(state, component, start, vertexToEdges)
      componentMax = Math.max(componentMax, pathLength)
    }

    maxLength = Math.max(maxLength, componentMax)
  }

  return maxLength
}

/** Find longest path starting from a given edge using DFS */
function findLongestPathFromEdge(
  state: GameState,
  component: Set<string>,
  startEdge: string,
  vertexToEdges: Map<string, string[]>
): number {
  let maxPath = 0

  const dfs = (currentEdge: string, visited: Set<string>, pathLength: number) => {
    maxPath = Math.max(maxPath, pathLength)
    const e = state.edges[currentEdge]
    if (!e) return

    // Try continuing through each vertex
    for (const vid of [e.v1, e.v2]) {
      const adjEdges = vertexToEdges.get(vid) || []
      for (const nextEdge of adjEdges) {
        if (nextEdge === currentEdge) continue
        if (!component.has(nextEdge)) continue
        if (visited.has(nextEdge)) continue

        visited.add(nextEdge)
        dfs(nextEdge, visited, pathLength + 1)
        visited.delete(nextEdge)
      }
    }
  }

  dfs(startEdge, new Set([startEdge]), 1)
  return maxPath
}

/** Update longest road and adjust victory points accordingly */
/**
 * Checks if a player has a settlement or city on a harbor vertex.
 * Returns the harbor type if found, or null.
 */
export function getPlayerHarborType(state: GameState, playerId: PlayerId, giveResource: Terrain): HarborType | null {
  for (const harbor of state.harbors) {
    // Check if player has a structure on either vertex of this harbor
    const hasStructure = harbor.vertexIds.some(vertexId => {
      const vertex = state.vertices[vertexId]
      return vertex?.structure?.player === playerId
    })
    
    if (hasStructure) {
      // If it's a specific resource harbor and matches what we're giving, return 2:1 rate
      if (harbor.type === giveResource) {
        return harbor.type // 2:1 for this specific resource
      }
      // If it's a generic harbor, return generic (3:1)
      if (harbor.type === 'generic') {
        return 'generic'
      }
    }
  }
  return null
}

/**
 * Gets the best trade rate for a player trading a specific resource.
 * Returns the number of resources needed to give (2, 3, or 4).
 */
export function getTradeRate(state: GameState, playerId: PlayerId, giveResource: Terrain): number {
  const harborType = getPlayerHarborType(state, playerId, giveResource)
  if (harborType === giveResource) {
    return 2 // 2:1 specific resource harbor
  }
  if (harborType === 'generic') {
    return 3 // 3:1 generic harbor
  }
  return 4 // 4:1 default bank rate
}

export function updateLongestRoad(state: GameState): void {
  const MIN_LONGEST_ROAD = 6
  let maxLength = 0
  let newLongestPlayerId: PlayerId | null = null

  // Find player with longest road
  for (const player of state.players) {
    const length = calculateLongestRoad(state, player.id)
    if (length >= MIN_LONGEST_ROAD && length > maxLength) {
      maxLength = length
      newLongestPlayerId = player.id
    }
  }

  const oldLongestPlayerId = state.longestRoadPlayerId

  // If longest road changed
  if (oldLongestPlayerId !== newLongestPlayerId) {
    // Remove 2 VP from old holder
    if (oldLongestPlayerId) {
      const oldPlayer = state.players[oldLongestPlayerId - 1]
      if (oldPlayer) {
        oldPlayer.victoryPoints = Math.max(0, oldPlayer.victoryPoints - 2)
      }
    }

    // Add 2 VP to new holder
    if (newLongestPlayerId) {
      const newPlayer = state.players[newLongestPlayerId - 1]
      if (newPlayer) {
        newPlayer.victoryPoints += 2
      }
    }

    state.longestRoadPlayerId = newLongestPlayerId
  }
}

