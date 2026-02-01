import { createBoard } from './board'
import { buildTopology } from './topology'
import { createHarbors } from './harbors'
import { createOmensDeck } from './omens'
import type { GameState, Player, Vertex, Edge, PlayerId } from './types'
import { AVAILABLE_COLORS } from '../components/ColorSelection'

function createPlayer(id: PlayerId, colorId: string, isAI: boolean = false): Player {
  const color = AVAILABLE_COLORS.find(c => c.id === colorId) || AVAILABLE_COLORS[0]
  return {
    id,
    name: isAI ? `Player ${id} (AI)` : `Player ${id}`,
    color: color.hexColor,
    colorId: color.id,
    colorImage: color.image,
    resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, desert: 0 },
    victoryPoints: 0,
    settlementsLeft: 5,
    citiesLeft: 4,
    roadsLeft: 15,
  }
}

export function createInitialState(
  numPlayers: 2 | 3 | 4,
  selectedColors?: string[],
  options?: { multiplayer?: boolean; oregonsOmens?: boolean }
): GameState {
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
  const isMultiplayer = options?.multiplayer === true

  if (selectedColors && selectedColors.length > 0) {
    // Use selected colors for human players
    for (let i = 0; i < selectedColors.length; i++) {
      const isAI = !isMultiplayer && numPlayers === 2 && i === 1 // Only player 2 is AI in 2-player single-player mode
      players.push(createPlayer((i + 1) as PlayerId, selectedColors[i], isAI))
    }
    
    // Assign random colors to remaining AI players (only when not multiplayer)
    const usedColorIds = new Set(selectedColors)
    const availableForAI = AVAILABLE_COLORS.filter(c => !usedColorIds.has(c.id))
    
    for (let i = selectedColors.length; i < numPlayers; i++) {
      const randomColor = availableForAI[Math.floor(Math.random() * availableForAI.length)]
      if (randomColor) {
        players.push(createPlayer((i + 1) as PlayerId, randomColor.id, !isMultiplayer))
        usedColorIds.add(randomColor.id)
      }
    }
  } else {
    // Fallback: use default colors if no selection provided
    const defaultColors = ['teal', 'green', 'pink', 'purple']
    for (let i = 1; i <= numPlayers; i++) {
      const isAI = !isMultiplayer && numPlayers === 2 && i === 2
      players.push(createPlayer(i as PlayerId, defaultColors[i - 1] || 'white', isAI))
    }
  }

  // Find the desert hex for the robber
  const desertHex = hexes.find(h => h.terrain === 'desert')

  const oregonsOmens = options?.oregonsOmens === true
  const playersWithOmens: Player[] = oregonsOmens
    ? players.map(p => ({
        ...p,
        omensHand: [],
        hasDrawnOmenThisTurn: false,
        hasPlayedOmenThisTurn: false,
      }))
    : players

  const baseState: GameState = {
    phase: 'setup',
    hexes,
    vertices: verts,
    edges: edgs,
    harbors,
    players: playersWithOmens,
    currentPlayerIndex: 0,
    setupPlacements: 0,
    setupPendingVertexId: null,
    lastDice: null,
    lastResourceFlash: null,
    lastResourceHexIds: null,
    robberHexId: desertHex?.id ?? null,
    lastRobbery: null,
    longestRoadPlayerId: null,
  }

  if (oregonsOmens) {
    return {
      ...baseState,
      omensDeck: createOmensDeck(),
      omensDiscardPile: [],
      activeOmensEffects: [],
    }
  }
  return baseState
}
