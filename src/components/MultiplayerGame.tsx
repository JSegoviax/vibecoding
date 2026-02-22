import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { trackEvent } from '../utils/analytics'
import { HexBoard } from './HexBoard'
import { ZoomableBoard } from './ZoomableBoard'
import { PlayerResources } from './PlayerResources'
import { VictoryPointTracker } from './VictoryPointTracker'
import { GameHistory } from './GameHistory'
import { GameGuide } from './GameGuide'
import { DiceRollAnimation } from './DiceRollAnimation'
import {
  canPlaceSettlement,
  canPlaceRoad,
  canPlaceRoadInSetup,
  getPlaceableVertices,
  getPlaceableRoadsForVertex,
  getPlaceableRoads,
  canAfford,
  canAffordWithCost,
  canBuildCity,
  getMissingResources,
  getMissingResourcesWithCost,
  getBuildCost,
  distributeResources,
  getHexIdsThatProducedResources,
  getHexIdsBlockedByRobber,
  giveInitialResources,
  getPlayersOnHex,
  stealResource,
  updateLongestRoad,
  updateOmenHand,
  getTradeRate,
} from '../game/logic'
import {
  isOmensEnabled,
  canDrawOmenCard,
  drawOmenCard,
  canPlayOmenCard,
  playOmenCard,
  getOmenCardName,
  getOmenCardEffectText,
  getEffectiveBuildCost,
  getBuildCostDebuffSources,
  consumeCostEffectAfterBuild,
  consumeFreeBuildEffect,
  consumePathfinderEffect,
  canBuildThisTurn,
  roadIgnoresAdjacencyThisTurn,
  resetPlayerOmensFlagsForNewTurn,
  applyProductionModifiersAfterRoll,
  getEffectiveTradeRate,
  getActiveEffectsForPlayer,
  getActiveEffectDescription,
  getHexesForFarmSwap,
  TOTAL_OMEN_DECK_SIZE,
} from '../game/omens'
import type { PlayOmenTargets } from '../game/omens'
import {
  runAISetup,
  runAITurn,
  runAITrade,
  runAIRobberMove,
  runAISelectPlayerToRob,
  runAIDrawOmen,
  runAIPlayOmen,
} from '../game/ai'
import {
  appendGameLog,
  getSetupOrderSequence,
  getNextPlayerIndex,
  getFirstPlayerIndex,
  applyRollOrderRoll,
} from '../game/state'
import type { GameState, PlayerId } from '../game/types'
import { TERRAIN_LABELS } from '../game/terrain'

function getSetupPlayerIndex(state: GameState): number {
  const sequence = getSetupOrderSequence(state)
  return sequence[Math.min(state.setupPlacements, sequence.length - 1)] ?? 0
}

function normalizeState(s: GameState): GameState {
  return { ...s, setupPendingVertexId: s.setupPendingVertexId ?? null, lastRobbery: s.lastRobbery ?? null, lastOmenBuffPlayed: s.lastOmenBuffPlayed ?? null, lastPantryNegation: s.lastPantryNegation ?? null }
}

type Props = { gameId: string; myPlayerIndex: number; initialState: GameState }

export function MultiplayerGame({ gameId, myPlayerIndex, initialState }: Props) {
  const [game, setGame] = useState<GameState>(() => normalizeState(initialState))
  const [buildMode, setBuildMode] = useState<'road' | 'settlement' | 'city' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [tradeFormOpen, setTradeFormOpen] = useState(false)
  const [tradeGive, setTradeGive] = useState<'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'>('wood')
  const [tradeGet, setTradeGet] = useState<'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'>('brick')
  const [robberMode, setRobberMode] = useState<{ moving: boolean; newHexId: string | null; playersToRob: Set<number> }>({ moving: false, newHexId: null, playersToRob: new Set() })
  const [omenRobberMode, setOmenRobberMode] = useState<{ cardId: string; step: 'hex' | 'player'; hexId?: string; playersOnHex?: Set<number> } | null>(null)
  const [diceRolling, setDiceRolling] = useState<{ dice1: number; dice2: number } | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'resources' | 'log'>('resources')
  const [dismissedInstruction, setDismissedInstruction] = useState<string | null>(null)
  const gameWonTrackedRef = useRef(false)
  const aiRunningRef = useRef(false)

  useEffect(() => {
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          const newState = (payload.new as { state: GameState }).state
          if (newState) setGame(normalizeState(newState))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  // —— AI execution (multiplayer games with bot-filled slots) ——
  const rollOrderRollerIndex =
    game.phase === 'roll_order'
      ? (game.orderTiebreak != null ? (game.orderTiebreak[game.orderTiebreakRollIndex ?? 0] ?? 0) : (game.orderRollIndex ?? 0))
      : 0
  const isAIRollOrderTurn = game.phase === 'roll_order' && game.players[rollOrderRollerIndex]?.isAI === true
  const setupPlayerIndexForAI = getSetupPlayerIndex(game)
  const setupPendingForAI = game.setupPendingVertexId ?? null
  const currentPlayerForAI = game.players[game.phase === 'setup' ? setupPlayerIndexForAI : game.currentPlayerIndex]
  const isAITurn = myPlayerIndex >= 0 && (currentPlayerForAI?.isAI === true)
  const aiPlayerId = currentPlayerForAI?.id ?? (1 as PlayerId)
  const numPlayers = game.players.length
  const winnerForAI = game.players.find(p => p.victoryPoints >= 10)

  useEffect(() => {
    if (!isAIRollOrderTurn || aiRunningRef.current) return
    aiRunningRef.current = true
    const t = setTimeout(() => {
      const a = 1 + Math.floor(Math.random() * 6)
      const b = 1 + Math.floor(Math.random() * 6)
      const sum = a + b
      const next = applyRollOrderRoll(game, rollOrderRollerIndex, sum)
      const withLog = appendGameLog(next, { type: 'roll_order', message: `Player ${rollOrderRollerIndex + 1} rolled ${a} + ${b} = ${sum} for turn order` })
      sendStateUpdate({ ...withLog, lastDice: [a, b] as [number, number] })
      aiRunningRef.current = false
    }, 500)
    return () => clearTimeout(t)
  }, [isAIRollOrderTurn, game.phase, game.orderRollIndex, game.orderTiebreakRollIndex, rollOrderRollerIndex])

  useEffect(() => {
    if (!isAITurn || aiRunningRef.current || winnerForAI) return
    if (game.phase === 'setup' && !setupPendingForAI) {
      aiRunningRef.current = true
      const t = setTimeout(() => {
        try {
          const { vertexId, edgeId } = runAISetup(game, aiPlayerId)
          let next: GameState = {
            ...game,
            vertices: { ...game.vertices },
            players: game.players.map(p => ({ ...p, resources: { ...p.resources } })),
            setupPendingVertexId: vertexId,
          }
          next.vertices[vertexId] = { ...next.vertices[vertexId], structure: { player: aiPlayerId, type: 'settlement' } }
          next.players = game.players.map((p, i) =>
            i === aiPlayerId - 1 ? { ...p, resources: { ...p.resources }, settlementsLeft: p.settlementsLeft - 1, victoryPoints: p.victoryPoints + 1 } : p
          )
          if (game.setupPlacements >= numPlayers) giveInitialResources(next, vertexId)
          next = { ...next, edges: { ...next.edges }, setupPendingVertexId: null }
          next.edges[edgeId] = { ...next.edges[edgeId], road: aiPlayerId }
          next.players = next.players.map((p, i) => (i === aiPlayerId - 1 ? { ...p, roadsLeft: p.roadsLeft - 1 } : p))
          next.setupPlacements = (next.setupPlacements ?? 0) + 1
          if (next.setupPlacements >= 2 * numPlayers) {
            next.phase = 'playing'
            next.currentPlayerIndex = getFirstPlayerIndex(next)
          }
          updateLongestRoad(next)
          sendStateUpdate(appendGameLog(next, { type: 'setup', message: `Player ${aiPlayerId} placed settlement and road (setup)` }))
        } catch {
          // no-op
        }
        aiRunningRef.current = false
      }, 400)
      return () => clearTimeout(t)
    }
    return undefined
  }, [isAITurn, game.phase, game.setupPlacements, setupPendingForAI, winnerForAI, aiPlayerId, numPlayers])

  useEffect(() => {
    if (!isAITurn || aiRunningRef.current || winnerForAI || game.phase !== 'playing' || game.lastDice || diceRolling) return
    aiRunningRef.current = true
    const t = setTimeout(() => {
      const a = 1 + Math.floor(Math.random() * 6)
      const b = 1 + Math.floor(Math.random() * 6)
      const sum = a + b
      let next: GameState = {
        ...game,
        lastDice: [a, b] as [number, number],
        players: game.players.map(p => ({ ...p, resources: { ...p.resources } })),
        lastResourceFlash: null,
      }
      if (sum === 7) {
        next.lastResourceHexIds = []
      } else {
        next.lastResourceFlash = distributeResources(next, sum) || null
        next.lastResourceHexIds = getHexIdsThatProducedResources(next, sum)
        if (isOmensEnabled(next)) next = applyProductionModifiersAfterRoll(next, sum)
      }
      sendStateUpdate(appendGameLog(next, { type: 'dice', message: `Player ${aiPlayerId} rolled ${a} + ${b} = ${sum}` }))
      aiRunningRef.current = false
    }, 500)
    return () => clearTimeout(t)
  }, [isAITurn, game.phase, game.currentPlayerIndex, game.lastDice, winnerForAI, diceRolling, aiPlayerId])

  useEffect(() => {
    if (!isAITurn || aiRunningRef.current || winnerForAI || game.phase !== 'playing' || !game.lastDice) return
    const sum = game.lastDice[0] + game.lastDice[1]
    if (sum !== 7) return
    aiRunningRef.current = true
    const t = setTimeout(() => {
      try {
        const hexId = runAIRobberMove(game, aiPlayerId)
        const targetPlayerId = runAISelectPlayerToRob(game, hexId, aiPlayerId)
        const next: GameState = {
          ...game,
          robberHexId: hexId,
          players: game.players.map(p => ({ ...p, resources: { ...p.resources } })),
          lastRobbery: null,
        }
        let stolen: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | null = null
        if (targetPlayerId != null) {
          stolen = stealResource(next, aiPlayerId, targetPlayerId) as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | null
        }
        next.lastRobbery = stolen ? { robbingPlayerId: aiPlayerId, targetPlayerId: targetPlayerId as PlayerId, resource: stolen } : null
        const msg = stolen ? `Player ${aiPlayerId} stole from Player ${targetPlayerId}` : `Player ${aiPlayerId} moved the robber`
        sendStateUpdate(appendGameLog(next, { type: 'robbery', message: msg }))
      } catch {
        // no-op
      }
      aiRunningRef.current = false
    }, 400)
    return () => clearTimeout(t)
  }, [isAITurn, game.phase, game.currentPlayerIndex, game.lastDice, game.robberHexId, winnerForAI, aiPlayerId])

  useEffect(() => {
    if (!isAITurn || aiRunningRef.current || winnerForAI || game.phase !== 'playing' || !game.lastDice) return
    const sum = game.lastDice[0] + game.lastDice[1]
    if (sum === 7 && !game.lastRobbery) return
    if (robberMode.moving || robberMode.newHexId || omenRobberMode) return
    aiRunningRef.current = true
    const t = setTimeout(() => {
      try {
        let next: GameState = game
        if (runAIDrawOmen(game, aiPlayerId)) {
          next = drawOmenCard(game, aiPlayerId)
          updateOmenHand(next)
          sendStateUpdate(next)
          aiRunningRef.current = false
          return
        }
        const playOmen = runAIPlayOmen(game, aiPlayerId)
        if (playOmen && playOmen.cardId !== 'robbers_regret') {
          sendStateUpdate(playOmenCard(game, aiPlayerId, playOmen.cardId, playOmen.targets))
          aiRunningRef.current = false
          return
        }
        const trade = runAITrade(game, aiPlayerId)
        if (trade) {
          const p = game.players[game.currentPlayerIndex]
          if (p && (p.resources[trade.give] || 0) >= 4) {
            next = {
              ...game,
              players: game.players.map((pl, i) => {
                if (i !== game.currentPlayerIndex) return pl
                const res = { ...pl.resources }
                res[trade.give] = Math.max(0, (res[trade.give] || 0) - 4)
                res[trade.get] = (res[trade.get] || 0) + 1
                return { ...pl, resources: res }
              }),
            }
            sendStateUpdate(next)
            aiRunningRef.current = false
            return
          }
        }
        const decision = runAITurn(game, aiPlayerId)
        if (decision.action === 'end') {
          const nextIndex = (game.currentPlayerIndex + 1) % game.players.length
          next = { ...game, currentPlayerIndex: nextIndex, lastDice: null, lastResourceFlash: null }
          if (isOmensEnabled(next)) next = resetPlayerOmensFlagsForNewTurn(next, nextIndex)
          sendStateUpdate(appendGameLog(next, { type: 'turn', message: `Turn: Player ${nextIndex + 1}'s turn` }))
        } else if (decision.action === 'settlement' && 'vertexId' in decision) {
          const vid = decision.vertexId
          const cost = isOmensEnabled(game) ? getEffectiveBuildCost(game, aiPlayerId, 'settlement') : getBuildCost('settlement')
          next = { ...game, vertices: { ...game.vertices } }
          next.vertices[vid] = { ...next.vertices[vid], structure: { player: aiPlayerId, type: 'settlement' } }
          next.players = game.players.map((p, i) => {
            if (i !== aiPlayerId - 1) return p
            const res = { ...p.resources }
            for (const [t, n] of Object.entries(cost)) {
              if (n != null && n > 0) (res as Record<string, number>)[t] = Math.max(0, ((res as Record<string, number>)[t] || 0) - (n as number))
            }
            return { ...p, resources: res, settlementsLeft: p.settlementsLeft - 1, victoryPoints: p.victoryPoints + 1 }
          })
          if (isOmensEnabled(next)) next = consumeCostEffectAfterBuild(next, aiPlayerId, 'settlement')
          if (isOmensEnabled(next)) next = consumeFreeBuildEffect(next, aiPlayerId, 'settlement')
          sendStateUpdate(appendGameLog(next, { type: 'build', message: `Player ${aiPlayerId} built a settlement` }))
        } else if (decision.action === 'city' && 'vertexId' in decision) {
          const vid = decision.vertexId
          const cost = isOmensEnabled(game) ? getEffectiveBuildCost(game, aiPlayerId, 'city') : getBuildCost('city')
          next = { ...game, vertices: { ...game.vertices } }
          const v = next.vertices[vid]
          if (v?.structure) {
            next.vertices[vid] = { ...v, structure: { player: aiPlayerId, type: 'city' } }
            next.players = game.players.map((p, i) => {
              if (i !== aiPlayerId - 1) return p
              const res = { ...p.resources }
              for (const [t, n] of Object.entries(cost)) {
                if (n != null && n > 0) (res as Record<string, number>)[t] = Math.max(0, ((res as Record<string, number>)[t] || 0) - (n as number))
              }
              return { ...p, resources: res, citiesLeft: p.citiesLeft - 1, victoryPoints: p.victoryPoints + 1 }
            })
            if (isOmensEnabled(next)) next = consumeFreeBuildEffect(next, aiPlayerId, 'city')
            sendStateUpdate(appendGameLog(next, { type: 'build', message: `Player ${aiPlayerId} built a city` }))
          }
        } else if (decision.action === 'road' && 'edgeId' in decision) {
          const eid = decision.edgeId
          const roadCost = isOmensEnabled(game) ? getEffectiveBuildCost(game, aiPlayerId, 'road') : getBuildCost('road')
          next = { ...game, edges: { ...game.edges } }
          next.edges[eid] = { ...next.edges[eid], road: aiPlayerId }
          next.players = game.players.map((p, i) => {
            if (i !== aiPlayerId - 1) return p
            const res = { ...p.resources }
            for (const [t, n] of Object.entries(roadCost)) {
              if (n != null && n > 0) (res as Record<string, number>)[t] = Math.max(0, ((res as Record<string, number>)[t] || 0) - (n as number))
            }
            return { ...p, resources: res, roadsLeft: p.roadsLeft - 1 }
          })
          if (isOmensEnabled(next)) next = consumeCostEffectAfterBuild(next, aiPlayerId, 'road')
          if (isOmensEnabled(next)) next = consumeFreeBuildEffect(next, aiPlayerId, 'road')
          if (isOmensEnabled(game) && roadIgnoresAdjacencyThisTurn(game, aiPlayerId)) next = consumePathfinderEffect(next, aiPlayerId)
          updateLongestRoad(next)
          sendStateUpdate(appendGameLog(next, { type: 'build', message: `Player ${aiPlayerId} built a road` }))
        }
      } catch {
        // no-op
      }
      aiRunningRef.current = false
    }, 500)
    return () => clearTimeout(t)
  }, [isAITurn, game.phase, game.currentPlayerIndex, game.lastDice, game.lastRobbery, winnerForAI, robberMode.moving, robberMode.newHexId, omenRobberMode, aiPlayerId])

  const sendStateUpdate = async (nextState: GameState) => {
    setGame(nextState)
    await supabase
      .from('games')
      .update({ state: nextState, updated_at: new Date().toISOString() })
      .eq('id', gameId)
  }

  const isSpectator = myPlayerIndex < 0
  const n = game.players.length
  const rollOrderCurrentPlayerIndex =
    game.phase === 'roll_order'
      ? (game.orderTiebreak != null
          ? (game.orderTiebreak[game.orderTiebreakRollIndex ?? 0] ?? 0)
          : (game.orderRollIndex ?? 0))
      : 0
  const setupPlayerIndex = getSetupPlayerIndex(game)
  const currentPlayer =
    game.phase === 'roll_order'
      ? game.players[rollOrderCurrentPlayerIndex]
      : game.players[game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex]
  const playerId = currentPlayer?.id ?? 1
  const isMyTurn =
    !isSpectator &&
    (game.phase === 'roll_order'
      ? rollOrderCurrentPlayerIndex === myPlayerIndex
      : (game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex) === myPlayerIndex)
  const winner = game.players.find(p => p.victoryPoints >= 10)
  const setupPendingVertexId = game.setupPendingVertexId ?? null
  const isSetupRoad = game.phase === 'setup' && setupPendingVertexId != null

  const vertexStates: Record<string, { player: number; type: 'settlement' | 'city' }> = {}
  const edgeStates: Record<string, number> = {}
  for (const [id, v] of Object.entries(game.vertices)) {
    if (v.structure) vertexStates[id] = { player: v.structure.player, type: v.structure.type }
  }
  for (const [id, e] of Object.entries(game.edges)) {
    if (e.road) edgeStates[id] = e.road
  }

  const inRobberFlow = robberMode.moving || robberMode.newHexId != null
  const placeableVertices = new Set(
    !isMyTurn || inRobberFlow ? [] : game.phase === 'setup' && !isSetupRoad
      ? getPlaceableVertices(game, playerId)
      : buildMode === 'settlement'
        ? getPlaceableVertices(game, playerId)
        : []
  )
  const placeableEdges = new Set(
    !isMyTurn || inRobberFlow ? [] : isSetupRoad && setupPendingVertexId
      ? getPlaceableRoadsForVertex(game, setupPendingVertexId, playerId)
      : buildMode === 'road'
        ? getPlaceableRoads(game, playerId, isOmensEnabled(game) && roadIgnoresAdjacencyThisTurn(game, playerId as PlayerId))
        : []
  )
  const placeableCityVertices = new Set(
    !isMyTurn || inRobberFlow ? [] : buildMode === 'city'
      ? Object.keys(game.vertices).filter(id => canBuildCity(game, id, playerId))
      : []
  )
  const highlightedVertices = new Set([...placeableVertices, ...placeableCityVertices])
  const highlightedEdges = placeableEdges
  const selectableRobberHexes = omenRobberMode?.step === 'hex'
    ? new Set(game.hexes.map(h => h.id))
    : robberMode.moving
      ? new Set(game.hexes.filter(h => h.id !== game.robberHexId).map(h => h.id))
      : new Set<string>()

  const isPlaying = game.phase === 'playing' && !winner
  const roadCost = isOmensEnabled(game) ? getEffectiveBuildCost(game, playerId as PlayerId, 'road') : getBuildCost('road')
  const settlementCost = isOmensEnabled(game) ? getEffectiveBuildCost(game, playerId as PlayerId, 'settlement') : getBuildCost('settlement')
  const cityCost = isOmensEnabled(game) ? getEffectiveBuildCost(game, playerId as PlayerId, 'city') : getBuildCost('city')
  const buildAllowed = !isOmensEnabled(game) || canBuildThisTurn(game, playerId as PlayerId)
  const canBuildRoad = isPlaying && buildAllowed && currentPlayer && canAffordWithCost(currentPlayer, roadCost) && currentPlayer.roadsLeft > 0 && getPlaceableRoads(game, playerId, isOmensEnabled(game) && roadIgnoresAdjacencyThisTurn(game, playerId as PlayerId)).length > 0
  const canBuildSettlement = isPlaying && buildAllowed && currentPlayer && canAffordWithCost(currentPlayer, settlementCost) && currentPlayer.settlementsLeft > 0 && getPlaceableVertices(game, playerId).length > 0
  const hasPlaceableCity = isPlaying && buildAllowed && currentPlayer && canAffordWithCost(currentPlayer, cityCost) && currentPlayer.citiesLeft > 0 && Object.keys(game.vertices).some(id => canBuildCity(game, id, playerId))

  const handleSelectVertex = (vid: string) => {
    if (!isMyTurn) return
    if (game.phase === 'setup' && !isSetupRoad) {
      if (!canPlaceSettlement(game, vid, playerId)) return
      const next: GameState = { ...game, vertices: { ...game.vertices }, setupPendingVertexId: vid }
      next.vertices[vid] = { ...next.vertices[vid], structure: { player: playerId, type: 'settlement' } }
      next.players = game.players.map((p, i) =>
        i === playerId - 1 ? { ...p, resources: { ...p.resources }, settlementsLeft: p.settlementsLeft - 1, victoryPoints: p.victoryPoints + 1 } : p
      )
      if (game.setupPlacements >= n) giveInitialResources(next, vid)
      sendStateUpdate(appendGameLog(next, { type: 'setup', message: `Player ${playerId} placed settlement (setup)` }))
      return
    }
    if (game.phase === 'setup' && isSetupRoad) return
    if (buildMode === 'settlement' && canPlaceSettlement(game, vid, playerId)) {
      const cost = settlementCost
      if (!canAffordWithCost(currentPlayer!, cost)) {
        setErrorMessage('Insufficient resources. Need: ' + getMissingResourcesWithCost(currentPlayer!, cost).map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
        return
      }
      trackEvent('build', 'gameplay', 'settlement', 1)
      const next: GameState = { ...game, vertices: { ...game.vertices } }
      next.vertices[vid] = { ...next.vertices[vid], structure: { player: playerId, type: 'settlement' } }
      next.players = game.players.map((p, i) => {
        if (i !== playerId - 1) return p
        const res = { ...p.resources }
        for (const [t, n] of Object.entries(cost)) { if (n != null && n > 0) (res as Record<string, number>)[t] = Math.max(0, ((res as Record<string, number>)[t] || 0) - (n as number)) }
        return { ...p, resources: res, settlementsLeft: p.settlementsLeft - 1, victoryPoints: p.victoryPoints + 1 }
      })
      let result = next
      if (isOmensEnabled(result)) {
        result = consumeCostEffectAfterBuild(result, playerId as PlayerId, 'settlement')
        result = consumeFreeBuildEffect(result, playerId as PlayerId, 'settlement')
      }
      sendStateUpdate(appendGameLog(result, { type: 'build', message: `Player ${playerId} built a settlement` }))
      setBuildMode(null)
      setErrorMessage(null)
    }
    if (buildMode === 'city' && canBuildCity(game, vid, playerId)) {
      const cost = cityCost
      if (!currentPlayer || !canAffordWithCost(currentPlayer, cost)) {
        setErrorMessage('Insufficient resources. Need: ' + (currentPlayer ? getMissingResourcesWithCost(currentPlayer, cost).map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', ') : 'unknown'))
        return
      }
      const next: GameState = { ...game, vertices: { ...game.vertices } }
      const v = next.vertices[vid]
      if (v?.structure) {
        next.vertices[vid] = { ...v, structure: { player: playerId, type: 'city' } }
        next.players = game.players.map((p, i) => {
          if (i !== playerId - 1) return p
          const res = { ...p.resources }
          for (const [t, n] of Object.entries(cost)) { if (n != null && n > 0) (res as Record<string, number>)[t] = Math.max(0, ((res as Record<string, number>)[t] || 0) - (n as number)) }
          return { ...p, resources: res, settlementsLeft: p.settlementsLeft + 1, citiesLeft: p.citiesLeft - 1, victoryPoints: p.victoryPoints + 1 }
        })
        let result = next
        if (isOmensEnabled(result)) result = consumeFreeBuildEffect(result, playerId as PlayerId, 'city')
        sendStateUpdate(appendGameLog(result, { type: 'build', message: `Player ${playerId} built a city` }))
        setBuildMode(null)
        setErrorMessage(null)
      }
    }
  }

  const handleSelectEdge = (eid: string) => {
    if (!isMyTurn) return
    if (game.phase === 'setup' && isSetupRoad && setupPendingVertexId) {
      if (!canPlaceRoadInSetup(game, eid, playerId, setupPendingVertexId)) return
      const next: GameState = { ...game, edges: { ...game.edges }, setupPendingVertexId: null }
      next.edges[eid] = { ...next.edges[eid], road: playerId }
      next.players = game.players.map((p, i) => i === playerId - 1 ? { ...p, roadsLeft: p.roadsLeft - 1 } : p)
      next.setupPlacements = (next.setupPlacements || 0) + 1
      if (next.setupPlacements >= 2 * n) {
        next.phase = 'playing'
        next.currentPlayerIndex = getFirstPlayerIndex(next)
      }
      updateLongestRoad(next)
      sendStateUpdate(appendGameLog(next, { type: 'setup', message: `Player ${playerId} placed road (setup)` }))
      return
    }
    if (buildMode === 'road' && canPlaceRoad(game, eid, playerId)) {
      const roadCost = isOmensEnabled(game) ? getEffectiveBuildCost(game, playerId as PlayerId, 'road') : getBuildCost('road')
      if (!canAffordWithCost(currentPlayer!, roadCost)) {
        setErrorMessage('Insufficient resources.')
        return
      }
      trackEvent('build', 'gameplay', 'road', 1)
      const next: GameState = { ...game, edges: { ...game.edges } }
      next.edges[eid] = { ...next.edges[eid], road: playerId }
      next.players = game.players.map((p, i) => {
        if (i !== playerId - 1) return p
        const res = { ...p.resources }
        for (const [t, n] of Object.entries(roadCost)) { if (n != null && n > 0) (res as Record<string, number>)[t] = Math.max(0, ((res as Record<string, number>)[t] || 0) - n) }
        return { ...p, resources: res, roadsLeft: p.roadsLeft - 1 }
      })
      updateLongestRoad(next)
      let result = next
      if (isOmensEnabled(result)) result = consumeCostEffectAfterBuild(result, playerId as PlayerId, 'road')
      if (isOmensEnabled(result)) result = consumeFreeBuildEffect(result, playerId as PlayerId, 'road')
      if (isOmensEnabled(game) && roadIgnoresAdjacencyThisTurn(game, playerId as PlayerId)) result = consumePathfinderEffect(result, playerId as PlayerId)
      sendStateUpdate(result)
      setBuildMode(null)
      setErrorMessage(null)
    }
  }

  const handleDrawOmenCard = () => {
    if (!isMyTurn || !canDrawOmenCard(game, playerId as PlayerId)) return
    const next = drawOmenCard(game, playerId as PlayerId)
    updateOmenHand(next)
    sendStateUpdate(next)
  }

  const handlePlayOmenCard = (cardId: string, targets?: PlayOmenTargets) => {
    if (!isMyTurn || !canPlayOmenCard(game, playerId as PlayerId, cardId, targets)) return
    if (cardId === 'robbers_regret') {
      setOmenRobberMode({ cardId: 'robbers_regret', step: 'hex' })
      return
    }
    sendStateUpdate(playOmenCard(game, playerId as PlayerId, cardId, targets))
  }

  const handleRoll = () => {
    if (!isMyTurn) return
    const a = 1 + Math.floor(Math.random() * 6)
    const b = 1 + Math.floor(Math.random() * 6)
    trackEvent('dice_roll_started', 'gameplay', 'multiplayer')
    setDiceRolling({ dice1: a, dice2: b })
  }

  const handleDiceRollComplete = () => {
    if (!diceRolling) return
    const { dice1, dice2 } = diceRolling
    const sum = dice1 + dice2
    trackEvent('dice_rolled', 'gameplay', `sum_${sum}`, sum)
    setDiceRolling(null)
    let next: GameState = {
      ...game,
      lastDice: [dice1, dice2] as [number, number],
      players: game.players.map(p => ({ ...p, resources: { ...p.resources } })),
      lastResourceFlash: null,
    }
    if (sum === 7) {
      setBuildMode(null)
      setRobberMode({ moving: true, newHexId: null, playersToRob: new Set() })
      next.lastResourceHexIds = []
    } else {
      next.lastResourceFlash = distributeResources(next, sum) || null
      next.lastResourceHexIds = getHexIdsThatProducedResources(next, sum)
      // Oregon's Omens: must run after every roll. Applies Dysentery (no Wheat), Drought, Famine, etc.,
      // and ticks rollsRemaining so roll-based effects expire. Do not remove.
      if (isOmensEnabled(next)) {
        next = applyProductionModifiersAfterRoll(next, sum)
      }
    }
    let result = appendGameLog(next, { type: 'dice', message: `Player ${playerId} rolled ${dice1} + ${dice2} = ${sum}` })
    if (sum !== 7 && next.lastResourceFlash && Object.keys(next.lastResourceFlash).length > 0) {
      const parts = Object.entries(next.lastResourceFlash)
        .filter(([, arr]) => arr.length > 0)
        .map(([idx, arr]) => {
          const counts: Record<string, number> = {}
          for (const t of arr) counts[t] = (counts[t] ?? 0) + 1
          const list = Object.entries(counts)
            .map(([t, n]) => (n === 1 ? TERRAIN_LABELS[t as keyof typeof TERRAIN_LABELS] : `${n} ${TERRAIN_LABELS[t as keyof typeof TERRAIN_LABELS]}`))
            .join(', ')
          return `Player ${Number(idx) + 1} gained ${list}`
        })
      if (parts.length > 0) {
        result = appendGameLog(result, { type: 'resources', message: parts.join('. ') })
      }
    }
    sendStateUpdate(result)
  }

  const handleSelectOmenRobberHex = (hexId: string) => {
    if (!omenRobberMode || omenRobberMode.step !== 'hex') return
    const playersOnHex = getPlayersOnHex(game, hexId)
    setOmenRobberMode({ cardId: 'robbers_regret', step: 'player', hexId, playersOnHex })
  }

  const handleSelectRobberHex = (hexId: string) => {
    if (omenRobberMode) return
    if (!robberMode.moving) return
    if (hexId === game.robberHexId) {
      setErrorMessage('Robber must move to a different hex')
      return
    }
    const playersOnHex = getPlayersOnHex(game, hexId)
    const playersToRob = new Set(Array.from(playersOnHex).filter(pid => pid !== playerId))
    if (playersToRob.size > 0) {
      setRobberMode({ moving: false, newHexId: hexId, playersToRob })
    } else {
      trackEvent('robber_moved', 'gameplay', 'multiplayer')
      setBuildMode(null)
      const next: GameState = { ...game, robberHexId: hexId }
      sendStateUpdate(appendGameLog(next, { type: 'robbery', message: `Player ${playerId} moved the robber` }))
      setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
      setErrorMessage(null)
    }
  }

  const handleSelectPlayerToRob = (targetPlayerId: number) => {
    if (!robberMode.newHexId) return
    trackEvent('robber_moved', 'gameplay', 'multiplayer')
    const next: GameState = {
      ...game,
      robberHexId: robberMode.newHexId,
      players: game.players.map(p => ({ ...p, resources: { ...p.resources } })),
      lastRobbery: null,
    }
    const stolen = stealResource(next, playerId, targetPlayerId) as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | null
    next.lastRobbery = stolen ? { robbingPlayerId: playerId as PlayerId, targetPlayerId: targetPlayerId as PlayerId, resource: stolen } : null
    const resourceLabel = stolen ? TERRAIN_LABELS[stolen] : ''
    const msg = stolen ? `Player ${playerId} stole ${resourceLabel} from Player ${targetPlayerId}` : `Player ${playerId} moved the robber (Player ${targetPlayerId} had nothing to steal)`
    sendStateUpdate(appendGameLog(next, { type: 'robbery', message: msg }))
    setBuildMode(null)
    setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
    setErrorMessage(stolen ? null : 'Target player has no resources to steal')
  }

  const handleEndTurn = () => {
    if (!isMyTurn) return
    trackEvent('end_turn', 'gameplay', 'multiplayer')
    const nextIndex = getNextPlayerIndex(game)
    let next: GameState = {
      ...game,
      currentPlayerIndex: nextIndex,
      lastDice: null,
      lastResourceFlash: null,
    }
    if (isOmensEnabled(next)) next = resetPlayerOmensFlagsForNewTurn(next, nextIndex)
    sendStateUpdate(appendGameLog(next, { type: 'turn', message: `Turn: Player ${nextIndex + 1}'s turn` }))
    setBuildMode(null)
    setTradeFormOpen(false)
    setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
    setOmenRobberMode(null)
  }

  const handleRollOrder = () => {
    if (game.phase !== 'roll_order' || !isMyTurn) return
    const dice1 = 1 + Math.floor(Math.random() * 6)
    const dice2 = 1 + Math.floor(Math.random() * 6)
    const sum = dice1 + dice2
    const next = applyRollOrderRoll(game, myPlayerIndex, sum)
    const withLog = appendGameLog(next, { type: 'roll_order', message: `Player ${playerId} rolled ${dice1} + ${dice2} = ${sum} for turn order` })
    sendStateUpdate({ ...withLog, lastDice: [dice1, dice2] as [number, number] })
  }

  const handleTrade = (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', get: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => {
    if (!isMyTurn) return
    const p = game.players[game.currentPlayerIndex]
    if (!p) return
    const baseRate = getTradeRate(game, playerId, give)
    const { rate: tradeRate, stateAfterTrade } = isOmensEnabled(game)
      ? getEffectiveTradeRate(game, playerId as PlayerId, give, baseRate)
      : { rate: baseRate, stateAfterTrade: undefined }
    if ((p.resources[give] || 0) < tradeRate) return
    let next: GameState = {
      ...game,
      players: game.players.map((pl, i) => {
        if (i !== game.currentPlayerIndex) return pl
        const res = { ...pl.resources }
        res[give] = Math.max(0, (res[give] || 0) - tradeRate)
        res[get] = (res[get] || 0) + 1
        return { ...pl, resources: res }
      }),
    }
    if (stateAfterTrade) next = { ...stateAfterTrade, players: next.players }
    sendStateUpdate(next)
    // Defer closing the trade form to the next frame to avoid Chrome layout/compositor glitches when resources and form disappear in the same paint
    requestAnimationFrame(() => {
      setTradeFormOpen(false)
      setErrorMessage(null)
    })
  }

  useEffect(() => {
    if (winner && !gameWonTrackedRef.current) {
      gameWonTrackedRef.current = true
      trackEvent('game_won', 'gameplay', winner.name, winner.victoryPoints)
    }
  }, [winner])

  // Auto-dismiss game toasts after 5s so they fade away
  const toastAutoDismissMs = 5000
  useEffect(() => {
    if (!game) return
    const hasToast = (game.lastOmenDebuffDrawn && game.lastOmenDebuffDrawn.playerId === playerId) ||
      (game.lastOmenBuffPlayed && game.lastOmenBuffPlayed.playerId === playerId) ||
      (game.lastPantryNegation && game.lastPantryNegation.playerId === playerId) ||
      game.lastRobbery ||
      !!errorMessage
    if (!hasToast) return
    const t = setTimeout(() => {
      const next = { ...game }
      let changed = false
      if (game.lastOmenDebuffDrawn && game.lastOmenDebuffDrawn.playerId === playerId) { next.lastOmenDebuffDrawn = null; changed = true }
      if (game.lastOmenBuffPlayed && game.lastOmenBuffPlayed.playerId === playerId) { next.lastOmenBuffPlayed = null; changed = true }
      if (game.lastPantryNegation && game.lastPantryNegation.playerId === playerId) { next.lastPantryNegation = null; changed = true }
      if (game.lastRobbery) { next.lastRobbery = null; changed = true }
      if (changed) sendStateUpdate(next)
      setErrorMessage(null)
    }, toastAutoDismissMs)
    return () => clearTimeout(t)
  }, [game?.lastOmenDebuffDrawn, game?.lastOmenBuffPlayed, game?.lastPantryNegation, game?.lastRobbery, errorMessage, playerId])

  const currentInstruction =
    game.phase === 'roll_order'
      ? (isMyTurn ? 'Roll the dice to determine turn order' : `${currentPlayer?.name ?? `Player ${rollOrderCurrentPlayerIndex + 1}`} is rolling for turn order…`)
      : game.phase === 'setup' && !isSetupRoad ? 'Place a settlement' :
    game.phase === 'setup' && isSetupRoad ? 'Place a road next to it' :
    isPlaying && robberMode.moving && !omenRobberMode ? 'Rolled 7! Click a hex to move the robber' :
    isPlaying && robberMode.newHexId && robberMode.playersToRob.size > 0 ? 'Select a player to rob' :
    isPlaying && omenRobberMode?.step === 'hex' ? "Robber's Regret: click a hex to move the robber" :
    isPlaying && omenRobberMode?.step === 'player' ? "Robber's Regret: select a player to rob (or skip)" :
    isPlaying && !robberMode.moving && !robberMode.newHexId && !omenRobberMode
      ? (isMyTurn ? 'Roll dice, then build or end turn' : `Waiting for Player ${game.currentPlayerIndex + 1}…`)
      : winner ? `${winner.name} wins with ${winner.victoryPoints} VP!` : null

  const showInstructionModal = currentInstruction != null && currentInstruction !== dismissedInstruction

  if (game.phase === 'roll_order') {
    const rolls = game.orderTiebreak != null ? (game.orderTiebreakRolls ?? []) : (game.orderRolls ?? [])
    const displayOrder = game.orderTiebreak ?? Array.from({ length: n }, (_, i) => i)
    return (
      <div className="game-page parchment-page" style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px', paddingTop: '8px' }}>
        <GameGuide />
        <div style={{ maxWidth: 480, margin: '32px auto', padding: 24, background: 'var(--parchment-section)', borderRadius: 12, border: '1px solid var(--paper-border)', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--ink)' }}>Roll for turn order</h2>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--ink)', opacity: 0.9 }}>
            {game.orderTiebreak != null ? 'Tiebreak: roll again to break the tie.' : 'Highest roll goes first. Roll the dice when it’s your turn.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, textAlign: 'left' }}>
            {displayOrder.map((playerIdx, i) => {
              const roll = rolls[i]
              const p = game.players[playerIdx]
              return (
                <div key={playerIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: roll >= 0 ? 'rgba(0,0,0,0.04)' : 'transparent', borderRadius: 8 }}>
                  <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{p?.name ?? `Player ${playerIdx + 1}`}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 14 }}>{roll >= 0 ? `Rolled ${roll}` : 'Waiting…'}</span>
                </div>
              )
            })}
          </div>
          {game.lastDice && (
            <p style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
              {game.lastDice[0]} + {game.lastDice[1]} = {game.lastDice[0] + game.lastDice[1]}
            </p>
          )}
          {isMyTurn ? (
            <button
              type="button"
              onClick={handleRollOrder}
              style={{
                padding: '14px 28px',
                fontSize: 16,
                fontWeight: 700,
                background: 'var(--cta, #D58258)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              Roll dice
            </button>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
              Waiting for {currentPlayer?.name ?? `Player ${rollOrderCurrentPlayerIndex + 1}`} to roll…
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="game-page parchment-page game-page--full-width" style={{ width: '100%', margin: 0, padding: '8px 16px 0' }}>
      <GameGuide />

      {isPlaying && omenRobberMode?.step === 'player' && omenRobberMode.hexId && (
        <div style={{ margin: '0 auto 16px', maxWidth: 400, padding: 12, borderRadius: 8, background: 'rgba(139,69,19,0.15)', border: '1px solid rgba(139,69,19,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text)', textAlign: 'center' }}>Steal from:</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {Array.from(omenRobberMode.playersOnHex ?? []).map(pid => (
              <button
                key={pid}
                onClick={() => {
                  sendStateUpdate(playOmenCard(game, playerId as PlayerId, 'robbers_regret', { hexId: omenRobberMode.hexId, targetPlayerId: pid as PlayerId }))
                  setOmenRobberMode(null)
                }}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--muted)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}
              >
                {game.players[pid - 1]?.name ?? `Player ${pid}`}
              </button>
            ))}
            <button
              onClick={() => {
                sendStateUpdate(playOmenCard(game, playerId as PlayerId, 'robbers_regret', { hexId: omenRobberMode.hexId }))
                setOmenRobberMode(null)
              }}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--muted)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}
            >
              Skip (move robber only)
            </button>
          </div>
        </div>
      )}

      <div className="game-layout-wrapper" style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Game toasts: modals above board, fade in and auto fade away */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            maxWidth: 500,
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto', width: '100%' }}>
            {game.lastOmenDebuffDrawn && game.lastOmenDebuffDrawn.playerId === playerId && (
              <div
                role="alert"
                className="game-toast-enter"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(254, 226, 226, 0.98)',
                  border: '1px solid rgba(185, 28, 28, 0.6)',
                  color: '#7f1d1d',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <span>
                  You drew a debuff: <strong>{getOmenCardName(game.lastOmenDebuffDrawn.cardId)}</strong> — {getOmenCardEffectText(game.lastOmenDebuffDrawn.cardId)}
                  {game.lastOmenDebuffDrawn.lostResources?.length ? (
                    <> You lost: {(() => {
                      const counts: Record<string, number> = {}
                      for (const t of game.lastOmenDebuffDrawn.lostResources!) {
                        counts[t] = (counts[t] ?? 0) + 1
                      }
                      return Object.entries(counts)
                        .map(([t, n]) => n === 1 ? TERRAIN_LABELS[t as keyof typeof TERRAIN_LABELS] : `${n} ${TERRAIN_LABELS[t as keyof typeof TERRAIN_LABELS]}`)
                        .join(', ')
                    })()}</>
                  ) : null}
                </span>
                <button onClick={() => sendStateUpdate({ ...game, lastOmenDebuffDrawn: null })} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss">×</button>
              </div>
            )}
            {game.lastOmenBuffPlayed && game.lastOmenBuffPlayed.playerId === playerId && (
              <div
                role="alert"
                className="game-toast-enter"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(220, 252, 231, 0.98)',
                  border: '1px solid rgba(22, 163, 74, 0.6)',
                  color: '#14532d',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <span>
                  <strong>{getOmenCardName(game.lastOmenBuffPlayed.cardId)}:</strong> you collected{' '}
                  {(() => {
                    const counts: Record<string, number> = {}
                    for (const t of game.lastOmenBuffPlayed.resourcesGained) {
                      counts[t] = (counts[t] ?? 0) + 1
                    }
                    return Object.entries(counts)
                      .map(([t, n]) => n === 1 ? TERRAIN_LABELS[t as keyof typeof TERRAIN_LABELS] : `${n} ${TERRAIN_LABELS[t as keyof typeof TERRAIN_LABELS]}`)
                      .join(', ')
                  })()}
                </span>
                <button onClick={() => sendStateUpdate({ ...game, lastOmenBuffPlayed: null })} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss">×</button>
              </div>
            )}
            {game.lastPantryNegation && game.lastPantryNegation.playerId === playerId && (
              <div
                role="alert"
                className="game-toast-enter"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(220, 252, 231, 0.98)',
                  border: '1px solid rgba(22, 163, 74, 0.6)',
                  color: '#14532d',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <span>
                  <strong>Well-Stocked Pantry</strong> negated <strong>{getOmenCardName(game.lastPantryNegation.negatedCardId)}</strong> — no resources lost.
                </span>
                <button onClick={() => sendStateUpdate({ ...game, lastPantryNegation: null })} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss">×</button>
              </div>
            )}
            {(game.lastRobbery || errorMessage) && (
              <div
                role="alert"
                className="game-toast-enter"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  ...(game.lastRobbery
                    ? (() => {
                        const r = game.lastRobbery!
                        const viewerId = (game.players[myPlayerIndex]?.id ?? (myPlayerIndex + 1)) as PlayerId
                        const isRobber = r.robbingPlayerId === viewerId
                        const isVictim = r.targetPlayerId === viewerId
                        const resourceLabel = r.resource ? TERRAIN_LABELS[r.resource] : ''
                        if (isRobber) return { background: 'rgba(220, 252, 231, 0.98)', border: '1px solid rgba(22, 163, 74, 0.6)', color: '#14532d' }
                        if (isVictim) return { background: 'rgba(254, 226, 226, 0.98)', border: '1px solid rgba(185, 28, 28, 0.6)', color: '#7f1d1d' }
                        return { background: 'rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.12)', color: 'var(--text)' }
                      })()
                    : { background: 'rgba(254, 226, 226, 0.98)', border: '1px solid rgba(185, 28, 28, 0.6)', color: '#7f1d1d' }),
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <span>
                  {game.lastRobbery
                    ? (() => {
                        const r = game.lastRobbery!
                        const viewerId = (game.players[myPlayerIndex]?.id ?? (myPlayerIndex + 1)) as PlayerId
                        const isRobber = r.robbingPlayerId === viewerId
                        const isVictim = r.targetPlayerId === viewerId
                        const resourceLabel = r.resource ? TERRAIN_LABELS[r.resource] : ''
                        return isRobber ? `You stole ${resourceLabel}` : isVictim ? `${game.players[r.robbingPlayerId - 1]?.name || `Player ${r.robbingPlayerId}`} stole your ${resourceLabel}` : `${game.players[r.robbingPlayerId - 1]?.name || `Player ${r.robbingPlayerId}`} stole ${resourceLabel} from ${game.players[r.targetPlayerId - 1]?.name || `Player ${r.targetPlayerId}`}`
                      })()
                    : errorMessage}
                </span>
                <button
                  onClick={() => {
                    setErrorMessage(null)
                    if (!isSpectator && game.lastRobbery) sendStateUpdate({ ...game, lastRobbery: null })
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="game-layout" style={{ display: 'flex', gap: 24, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
        <ZoomableBoard
          className="game-board"
          style={{ flex: '1 1 0', minWidth: 0, minHeight: 400, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
        >
          <HexBoard
            hexes={game.hexes}
            vertexStates={vertexStates}
            edgeStates={edgeStates}
            selectVertex={isMyTurn ? handleSelectVertex : undefined}
            selectEdge={isMyTurn ? handleSelectEdge : undefined}
            highlightedVertices={highlightedVertices}
            highlightedEdges={highlightedEdges}
            upgradableToCityVertices={buildMode === 'city' && hasPlaceableCity ? placeableCityVertices : undefined}
            robberHexId={game.robberHexId}
            selectableRobberHexes={selectableRobberHexes}
            selectHex={
              isSpectator
                ? undefined
                : omenRobberMode?.step === 'hex'
                  ? handleSelectOmenRobberHex
                  : robberMode.moving
                    ? handleSelectRobberHex
                    : undefined
            }
            harbors={game.harbors}
            players={game.players.map(p => ({ colorImage: p.colorImage, color: p.color }))}
            activePlayerIndex={game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex}
            phase={game.phase === 'setup' ? 'setup' : 'playing'}
            pulsePlaceableSpots={game.phase === 'setup' || (game.phase === 'playing' && buildMode === 'settlement')}
            resourceHighlightHexIds={game.lastResourceHexIds ? new Set(game.lastResourceHexIds) : undefined}
            robberBlockedHexIds={game.lastDice ? new Set(getHexIdsBlockedByRobber(game, game.lastDice[0] + game.lastDice[1])) : undefined}
          />
          {diceRolling && (
            <DiceRollAnimation
              dice1={diceRolling.dice1}
              dice2={diceRolling.dice2}
              onComplete={handleDiceRollComplete}
              allowTapToStop={isMyTurn}
            />
          )}
        </ZoomableBoard>

        <aside className="game-sidebar" style={{ position: 'relative', flex: '0 0 280px', minHeight: 0, background: 'var(--surface)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {showInstructionModal && (
            <div
              role="dialog"
              aria-live="polite"
              className="game-toast-enter game-instruction-modal"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 10,
                padding: '12px 16px',
                borderRadius: 10,
                background: '#FFFBF0',
                border: '1px solid rgba(42,26,10,0.2)',
                color: '#2A1A0A',
                fontSize: 15,
                fontWeight: 600,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                boxSizing: 'border-box',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, textAlign: 'center', wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                {currentInstruction}
              </span>
              <button
                type="button"
                onClick={() => setDismissedInstruction(currentInstruction)}
                aria-label="Dismiss"
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  minWidth: 36,
                  minHeight: 36,
                  padding: 0,
                  border: 'none',
                  borderRadius: 8,
                  background: 'rgba(42,26,10,0.12)',
                  color: '#2A1A0A',
                  cursor: 'pointer',
                  fontSize: 20,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
          )}
          <h1 className="game-title game-sidebar-title" style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 700, flexShrink: 0, lineHeight: 1.3, color: 'var(--ink, var(--text))' }}>
            Settlers of Oregon (Multiplayer){isSpectator && <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>Spectating</span>}
          </h1>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexShrink: 0 }}>
            <button
              type="button"
              className={`game-sidebar-tab ${sidebarTab === 'resources' ? 'game-sidebar-tab--active' : ''}`}
              onClick={() => setSidebarTab('resources')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Resources
            </button>
            <button
              type="button"
              className={`game-sidebar-tab ${sidebarTab === 'history' ? 'game-sidebar-tab--active' : ''}`}
              onClick={() => setSidebarTab('history')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Log
            </button>
          </div>
          <div className="game-sidebar-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sidebarTab === 'resources' && (
            <>
          <PlayerResources
            players={game.players}
            activePlayerIndex={game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex}
            phase={game.phase}
            lastResourceFlash={game.lastResourceFlash}
            lastDice={game.lastDice}
            onRollDice={isPlaying && isMyTurn ? handleRoll : undefined}
            onEndTurn={isPlaying && isMyTurn ? handleEndTurn : undefined}
            robberMode={robberMode}
            onSelectPlayerToRob={handleSelectPlayerToRob}
            buildMode={buildMode}
            onSetBuildMode={setBuildMode}
            tradeFormOpen={tradeFormOpen}
            onSetTradeFormOpen={setTradeFormOpen}
            tradeGive={tradeGive}
            onSetTradeGive={setTradeGive}
            tradeGet={tradeGet}
            onSetTradeGet={setTradeGet}
            onTrade={handleTrade}
            onSetErrorMessage={setErrorMessage}
            canAfford={
              isOmensEnabled(game)
                ? (p, s) => canAffordWithCost(p, getEffectiveBuildCost(game, playerId as PlayerId, s))
                : canAfford
            }
            getMissingResources={
              isOmensEnabled(game)
                ? (p, s) => getMissingResourcesWithCost(p, getEffectiveBuildCost(game, playerId as PlayerId, s))
                : getMissingResources
            }
            getTradeRate={
              isPlaying && isMyTurn
                ? (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => {
                    const base = getTradeRate(game, playerId, give)
                    return isOmensEnabled(game) ? getEffectiveTradeRate(game, playerId as PlayerId, give, base).rate : base
                  }
                : undefined
            }
            canBuildRoad={game.phase === 'playing' ? canBuildRoad : undefined}
            canBuildSettlement={game.phase === 'playing' ? canBuildSettlement : undefined}
            canBuildCity={game.phase === 'playing' ? hasPlaceableCity : undefined}
            oregonsOmensEnabled={isOmensEnabled(game)}
            canDrawOmenCard={isPlaying && isMyTurn ? canDrawOmenCard(game, playerId as PlayerId) : false}
            onDrawOmenCard={handleDrawOmenCard}
            omensHandCount={currentPlayer?.omensHand?.length ?? 0}
            omensHand={currentPlayer?.omensHand ?? []}
            canPlayOmenCard={isPlaying && isMyTurn ? (cardId: string) => canPlayOmenCard(game, playerId as PlayerId, cardId) : undefined}
            onPlayOmenCard={isPlaying && isMyTurn ? (cardId: string, targets?: PlayOmenTargets) => handlePlayOmenCard(cardId, targets) : undefined}
            getOmenCardName={getOmenCardName}
            getOmenCardEffectText={getOmenCardEffectText}
            activeOmensEffects={isOmensEnabled(game) ? getActiveEffectsForPlayer(game, playerId as PlayerId) : []}
            getActiveEffectDescription={getActiveEffectDescription}
            getEffectiveBuildCostForPlayer={isOmensEnabled(game) ? (pid, structure) => getEffectiveBuildCost(game, pid as PlayerId, structure) : undefined}
            getBuildCostDebuffSourcesForPlayer={isOmensEnabled(game) ? (pid) => getBuildCostDebuffSources(game, pid as PlayerId) : undefined}
            omenCardsPurchased={
              isOmensEnabled(game)
                ? game.players.reduce((s, p) => s + (p.omensHand?.length ?? 0), 0) + (game.omensDiscardPile?.length ?? 0)
                : undefined
            }
            omenCardsTotal={isOmensEnabled(game) ? TOTAL_OMEN_DECK_SIZE : undefined}
            reliableHarvestHexOptions={
              isOmensEnabled(game) && isPlaying && isMyTurn
                ? (() => {
                    const seen = new Map<string, string>()
                    for (const v of Object.values(game.vertices)) {
                      if (v.structure?.player !== playerId || !v.hexIds?.length) continue
                      for (const hid of v.hexIds) {
                        if (seen.has(hid)) continue
                        const h = game.hexes.find(x => x.id === hid)
                        if (h && h.terrain !== 'desert' && h.number != null)
                          seen.set(hid, `${TERRAIN_LABELS[h.terrain]} (${h.number})`)
                      }
                    }
                    return Array.from(seen.entries()).map(([hexId, label]) => ({ hexId, label }))
                  })()
                : undefined
            }
            farmSwapMyHexOptions={
              isOmensEnabled(game) && isPlaying && isMyTurn
                ? (() => {
                    const { myHexIds } = getHexesForFarmSwap(game, playerId as PlayerId)
                    return myHexIds.map(hexId => {
                      const h = game.hexes.find(x => x.id === hexId)
                      return { hexId, label: h ? `${TERRAIN_LABELS[h.terrain]} (${h.number})` : hexId }
                    })
                  })()
                : undefined
            }
            farmSwapTargetHexOptions={
              isOmensEnabled(game) && isPlaying && isMyTurn
                ? (() => {
                    const { targetHexIds } = getHexesForFarmSwap(game, playerId as PlayerId)
                    return targetHexIds.map(hexId => {
                      const h = game.hexes.find(x => x.id === hexId)
                      const playersOnHex = getPlayersOnHex(game, hexId)
                      const ownerIds = Array.from(playersOnHex).filter(pid => pid !== playerId)
                      const ownerNames = ownerIds.map(pid => game.players[pid - 1]?.name ?? `Player ${pid}`)
                      const ownerName = ownerNames.length ? ownerNames.join(', ') : 'Other player(s)'
                      return {
                        hexId,
                        label: h ? `${TERRAIN_LABELS[h.terrain]} (${h.number})` : hexId,
                        ownerId: ownerIds[0],
                        ownerName,
                      }
                    })
                  })()
                : undefined
            }
          />
          <VictoryPointTracker
            vertices={game.vertices}
            players={game.players}
            activePlayerIndex={game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex}
            phase={game.phase}
            longestRoadPlayerId={game.longestRoadPlayerId}
            oregonsOmensEnabled={isOmensEnabled(game)}
            omenHandPlayerId={game.omenHandPlayerId ?? null}
          />
            </>
          )}
          {sidebarTab === 'log' && (
            <GameHistory gameLog={game.gameLog ?? []} maxHeight={420} />
          )}
          {game.phase === 'setup' && <p style={{ fontSize: 14, color: 'var(--text)', padding: '8px 10px', borderRadius: 8, background: 'rgba(44,26,10,0.08)', border: '1px solid rgba(44,26,10,0.15)' }}>{isMyTurn ? (!isSetupRoad ? 'Click an empty spot to place a settlement.' : 'Click an edge connected to your settlement to place a road.') : `Waiting for Player ${setupPlayerIndex + 1}…`}</p>}
          {isPlaying && !isMyTurn && <p style={{ fontSize: 14, color: 'var(--text)', padding: '8px 10px', borderRadius: 8, background: 'rgba(44,26,10,0.08)', border: '1px solid rgba(44,26,10,0.15)' }}>Waiting for Player {game.currentPlayerIndex + 1}…</p>}
          {winner && <a href="/" style={{ padding: '10px 20px', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', marginTop: 8, textAlign: 'center', textDecoration: 'none' }}>Back to home</a>}
          </div>
        </aside>
        </div>
      </div>
    </div>
  )
}
