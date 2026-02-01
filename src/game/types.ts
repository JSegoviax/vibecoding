export type Terrain = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | 'desert'

export type PlayerId = 1 | 2 | 3 | 4

export type HarborType = Terrain | 'generic' // 'generic' means 3:1, specific resource means 2:1

export interface Harbor {
  id: string
  edgeId: EdgeId // The edge this harbor is on (coastal edge)
  vertexIds: [VertexId, VertexId] // The two vertices this harbor connects to
  type: HarborType // 'generic' for 3:1, or specific resource for 2:1
}

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

/** Active Oregon's Omens effect (ongoing cost/production/trade modifier, etc.) */
export interface ActiveOmenEffect {
  cardId: string
  playerId: PlayerId
  turnsRemaining?: number
  rollsRemaining?: number
  endsTurn?: number
  appliedEffect: Record<string, unknown>
  triggerCondition?: string
}

export interface Player {
  id: PlayerId
  name: string
  color: string // Hex color for UI
  colorId: string // Color identifier (teal, green, pink, etc.)
  colorImage: string // Path to house image
  resources: Record<Terrain, number>
  victoryPoints: number
  settlementsLeft: number
  citiesLeft: number
  roadsLeft: number
  /** Oregon's Omens: card IDs in hand (only when Omens enabled) */
  omensHand?: string[]
  /** Oregon's Omens: reset at start of turn */
  hasDrawnOmenThisTurn?: boolean
  /** Oregon's Omens: reset at start of turn */
  hasPlayedOmenThisTurn?: boolean
}

export interface GameState {
  phase: GamePhase
  hexes: Hex[]
  vertices: Record<VertexId, Vertex>
  edges: Record<EdgeId, Edge>
  harbors: Harbor[]
  players: Player[]
  currentPlayerIndex: number
  setupPlacements: number  // 0–1 for first placement round, 2–3 for second
  /** When set, current player must place a road next to this vertex (setup phase) */
  setupPendingVertexId: VertexId | null
  lastDice: [number, number] | null
  /** Per player index: terrain types that gained from last dice roll (for flash) */
  lastResourceFlash: Record<number, Terrain[]> | null
  /** Hex IDs that produced resources on the last roll (highlight until next roll) */
  lastResourceHexIds: string[] | null
  /** Hex ID where the robber is currently located */
  robberHexId: string | null
  /** Last robbery: who robbed whom and what resource (for per-viewer message/color) */
  lastRobbery: { robbingPlayerId: PlayerId; targetPlayerId: PlayerId; resource: Terrain | null } | null
  /** Player ID who currently has the longest road (minimum 5 roads) */
  longestRoadPlayerId: PlayerId | null
  /** Oregon's Omens: draw pile (only when Omens enabled) */
  omensDeck?: string[]
  /** Oregon's Omens: played/discarded cards (only when Omens enabled) */
  omensDiscardPile?: string[]
  /** Oregon's Omens: ongoing effects (only when Omens enabled) */
  activeOmensEffects?: ActiveOmenEffect[]
  /** Oregon's Omens: last debuff drawn (for UI feedback banner); cleared on dismiss. lostResources set for lost_supplies (and similar) so UI can show what was lost. */
  lastOmenDebuffDrawn?: { cardId: string; playerId: PlayerId; lostResources?: Terrain[] } | null
}
