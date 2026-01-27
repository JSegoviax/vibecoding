export type Terrain = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | 'desert'

export type PlayerId = 1 | 2 | 3 | 4

export interface Hex {
  id: string
  q: number
  r: number
  terrain: Terrain
  number: number | null  // 2–12, null for desert
}

export type VertexId = string
export type EdgeId = string

export type Structure = 'settlement' | 'city'
export type Road = true

export interface Vertex {
  id: VertexId
  hexIds: string[]  // for resource payout
  structure?: { player: PlayerId; type: Structure }
}

export interface Edge {
  id: EdgeId
  v1: VertexId
  v2: VertexId
  road?: PlayerId
}

export type GamePhase = 'setup' | 'playing' | 'ended'

export interface Player {
  id: PlayerId
  name: string
  color: string
  resources: Record<Terrain, number>
  victoryPoints: number
  settlementsLeft: number
  citiesLeft: number
  roadsLeft: number
}

export interface GameState {
  phase: GamePhase
  hexes: Hex[]
  vertices: Record<VertexId, Vertex>
  edges: Record<EdgeId, Edge>
  players: Player[]
  currentPlayerIndex: number
  setupPlacements: number  // 0–1 for first placement round, 2–3 for second
  lastDice: [number, number] | null
  /** Per player index: terrain types that gained from last dice roll (for flash) */
  lastResourceFlash: Record<number, Terrain[]> | null
  /** Hex ID where the robber is currently located */
  robberHexId: string | null
}
