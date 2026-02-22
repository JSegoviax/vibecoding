import { createBoard } from './board'
import { buildTopology } from './topology'
import { createHarbors } from './harbors'
import { createOmensDeck } from './omens'
import type { GameState, Player, Vertex, Edge, PlayerId } from './types'
export { appendGameLog } from './gameLog'

/** Sequence of player indices for setup placements (first round forward, second round reverse). Uses setupOrder when set. */
export function getSetupOrderSequence(state: GameState): number[] {
  const n = state.players.length
  const order = state.setupOrder ?? Array.from({ length: n }, (_, i) => i)
  return [...order, ...order.slice().reverse()]
}

/** Index of the player who goes next (for turn advance). Uses setupOrder when set. */
export function getNextPlayerIndex(state: GameState): number {
  const n = state.players.length
  const order = state.setupOrder ?? Array.from({ length: n }, (_, i) => i)
  const idx = order.indexOf(state.currentPlayerIndex)
  return order[(idx + 1) % n]
}

/** First player to act in playing phase (last placer in setup = first in setup order). */
export function getFirstPlayerIndex(state: GameState): number {
  const n = state.players.length
  const order = state.setupOrder ?? Array.from({ length: n }, (_, i) => i)
  return order[0]
}

/** Apply a roll in roll_order phase; returns next state (may transition to setup or another tiebreak). */
export function applyRollOrderRoll(state: GameState, playerIndex: number, diceSum: number): GameState {
  const n = state.players.length
  const next = { ...state, lastDice: null }
  if (state.orderTiebreak != null) {
    const tie = state.orderTiebreak
    const rolls = (state.orderTiebreakRolls ?? []).slice()
    const rollIndex = tie.indexOf(playerIndex)
    if (rollIndex < 0) return state
    rolls[rollIndex] = diceSum
    const nextTiebreakRollIndex = (state.orderTiebreakRollIndex ?? 0) + 1
    if (nextTiebreakRollIndex < tie.length) {
      return { ...next, orderTiebreakRolls: rolls, orderTiebreakRollIndex: nextTiebreakRollIndex }
    }
    const withRolls = tie.map((pi, i) => ({ pi, roll: rolls[i] ?? -1 }))
    const sorted = withRolls.slice().sort((a, b) => b.roll - a.roll)
    // Everyone who rolled the same as the highest roll is still tied
    const highestRoll = sorted[0]?.roll ?? -1
    const stillTied = sorted.filter(x => x.roll === highestRoll).map(x => x.pi)
    const groups = (state.orderMainGroups ?? []).slice()
    const groupIdx = state.orderTiebreakGroupIndex ?? 0
    if (stillTied.length > 1) {
      return {
        ...next,
        orderTiebreak: stillTied,
        orderTiebreakRolls: stillTied.map(() => -1),
        orderTiebreakRollIndex: 0,
      } as GameState
    }
    const resolvedOrder = sorted.map(x => x.pi)
    groups[groupIdx] = resolvedOrder
    // Only look for another unresolved tie in later groups; the group we just resolved still has length > 1
    const nextGroupWithTie = groups.findIndex((g, idx) => idx > groupIdx && g.length > 1)
    if (nextGroupWithTie >= 0) {
      return {
        ...next,
        orderMainGroups: groups,
        orderTiebreak: groups[nextGroupWithTie],
        orderTiebreakRolls: groups[nextGroupWithTie].map(() => -1),
        orderTiebreakRollIndex: 0,
        orderTiebreakGroupIndex: nextGroupWithTie,
      }
    }
    const setupOrder = groups.flat()
    return {
      ...next,
      phase: 'setup',
      setupOrder,
      orderMainGroups: undefined,
      orderTiebreak: null,
      orderTiebreakRolls: [],
      orderTiebreakRollIndex: 0,
      orderTiebreakGroupIndex: undefined,
      currentPlayerIndex: setupOrder[0],
    }
  }
  const rolls = (state.orderRolls ?? Array(n).fill(-1)).slice()
  rolls[playerIndex] = diceSum
  const nextRollIndex = (state.orderRollIndex ?? 0) + 1
  if (nextRollIndex < n) {
    return { ...next, orderRolls: rolls, orderRollIndex: nextRollIndex }
  }
  const withRolls = rolls.map((roll, i) => ({ i, roll }))
  const sorted = withRolls.slice().sort((a, b) => b.roll - a.roll)
  const groups: number[][] = []
  let i = 0
  while (i < sorted.length) {
    const group = [sorted[i].i]
    while (i + 1 < sorted.length && sorted[i + 1].roll === sorted[i].roll) {
      i++
      group.push(sorted[i].i)
    }
    groups.push(group)
    i++
  }
  const firstTie = groups.findIndex(g => g.length > 1)
  if (firstTie < 0) {
    const setupOrder = groups.flat()
    return {
      ...next,
      phase: 'setup',
      setupOrder,
      orderRolls: undefined,
      orderRollIndex: undefined,
      orderMainGroups: undefined,
      currentPlayerIndex: setupOrder[0],
    }
  }
  return {
    ...next,
    orderRolls: rolls,
    orderRollIndex: nextRollIndex,
    orderMainGroups: groups,
    orderTiebreak: groups[firstTie],
    orderTiebreakRolls: groups[firstTie].map(() => -1),
    orderTiebreakRollIndex: 0,
    orderTiebreakGroupIndex: firstTie,
  }
}

import { AVAILABLE_COLORS } from '../components/ColorSelection'

function createPlayer(id: PlayerId, colorId: string, isAI: boolean = false): Player {
  const color = AVAILABLE_COLORS.find(c => c.id === colorId) || AVAILABLE_COLORS[0]
  return {
    id,
    name: isAI ? `Player ${id} (AI)` : `Player ${id}`,
    ...(isAI && { isAI: true }),
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
  options?: { multiplayer?: boolean; oregonsOmens?: boolean; humanCount?: number }
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
  const humanCount = options?.humanCount

  if (selectedColors && selectedColors.length > 0) {
    // humanCount (multiplayer with bots): first humanCount players are human, rest AI
    const effectiveHumanCount =
      humanCount != null && isMultiplayer ? Math.min(humanCount, selectedColors.length) : null
    for (let i = 0; i < selectedColors.length; i++) {
      const isAI =
        effectiveHumanCount != null
          ? i >= effectiveHumanCount
          : !isMultiplayer && numPlayers === 2 && i === 1
      players.push(createPlayer((i + 1) as PlayerId, selectedColors[i], isAI))
    }
    if (players.length < numPlayers) {
      const usedColorIds = new Set(selectedColors)
      const availableForAI = AVAILABLE_COLORS.filter(c => !usedColorIds.has(c.id))
      for (let i = players.length; i < numPlayers; i++) {
        const randomColor = availableForAI[Math.floor(Math.random() * availableForAI.length)]
        if (randomColor) {
          const isAI = effectiveHumanCount != null ? i >= (effectiveHumanCount ?? 0) : !isMultiplayer
          players.push(createPlayer((i + 1) as PlayerId, randomColor.id, isAI))
          usedColorIds.add(randomColor.id)
        }
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
        omenCardsPurchased: 0,
        hasDrawnOmenThisTurn: false,
        hasPlayedOmenThisTurn: false,
      }))
    : players

  const n = playersWithOmens.length
  const baseState: GameState = {
    phase: 'roll_order',
    hexes,
    vertices: verts,
    edges: edgs,
    harbors,
    players: playersWithOmens,
    currentPlayerIndex: 0,
    orderRolls: Array(n).fill(-1),
    orderRollIndex: 0,
    orderTiebreak: null,
    orderTiebreakRolls: [],
    orderTiebreakRollIndex: 0,
    setupPlacements: 0,
    setupPendingVertexId: null,
    lastDice: null,
    lastResourceFlash: null,
    lastResourceHexIds: null,
    robberHexId: desertHex?.id ?? null,
    lastRobbery: null,
    longestRoadPlayerId: null,
    gameLog: [],
    ...(numPlayers === 2 && !options?.multiplayer ? { aiPersona: randomPersona() } : {}),
  }

  if (oregonsOmens) {
    return {
      ...baseState,
      omenHandPlayerId: null,
      omensDeck: createOmensDeck(),
      omensDiscardPile: [],
      activeOmensEffects: [],
    }
  }
  return baseState
}
