import { createBoard } from './board'
import { buildTopology } from './topology'
import { createHarbors } from './harbors'
import type { GameState, Player, Vertex, Edge, PlayerId } from './types'

const PLAYER_COLORS: Record<PlayerId, string> = {
  1: '#e53935',
  2: '#1e88e5',
  3: '#43a047',
  4: '#fb8c00',
}

function createPlayer(id: PlayerId): Player {
  return {
    id,
    name: `Player ${id}`,
    color: PLAYER_COLORS[id],
    resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, desert: 0 },
    victoryPoints: 0,
    settlementsLeft: 5,
    citiesLeft: 4,
    roadsLeft: 15,
  }
}

export function createInitialState(numPlayers: 2 | 3 | 4): GameState {
  const hexes = createBoard()
  const { vertices, edges } = buildTopology(hexes)

  const verts: Record<string, Vertex> = {}
  for (const v of vertices) {
    verts[v.id] = { id: v.id, hexIds: v.hexIds }
  }
  const edgs: Record<string, Edge> = {}
  for (const e of edges) {
    edgs[e.id] = { id: e.id, v1: e.v1, v2: e.v2 }
  }

  const harbors = createHarbors(hexes)
  console.log('Created harbors:', harbors.length, harbors)

  const players: Player[] = []
  for (let i = 1; i <= numPlayers; i++) {
    const p = createPlayer(i as PlayerId)
    if (numPlayers === 2 && i === 2) p.name = 'Player 2 (AI)'
    players.push(p)
  }

  // Find the desert hex for the robber
  const desertHex = hexes.find(h => h.terrain === 'desert')

  return {
    phase: 'setup',
    hexes,
    vertices: verts,
    edges: edgs,
    harbors,
    players,
    currentPlayerIndex: 0,
    setupPlacements: 0,
    lastDice: null,
    lastResourceFlash: null,
    robberHexId: desertHex?.id ?? null,
    longestRoadPlayerId: null,
  }
}
