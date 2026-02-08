import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { trackEvent } from '../utils/analytics'
import { HexBoard } from './HexBoard'
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
import { appendGameLog } from '../game/state'
import type { GameState, PlayerId } from '../game/types'
import { TERRAIN_LABELS } from '../game/terrain'

const SETUP_ORDER: Record<number, number[]> = {
  2: [0, 1, 1, 0],
  3: [0, 1, 2, 2, 1, 0],
  4: [0, 1, 2, 3, 3, 2, 1, 0],
}

function getSetupPlayerIndex(state: GameState): number {
  const n = state.players.length
  const order = SETUP_ORDER[n as 2 | 3 | 4] ?? SETUP_ORDER[2]
  return order[Math.min(state.setupPlacements, order.length - 1)] ?? 0
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
  const [sidebarTab, setSidebarTab] = useState<'resources' | 'history'>('resources')
  const gameWonTrackedRef = useRef(false)

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

  const sendStateUpdate = async (nextState: GameState) => {
    setGame(nextState)
    await supabase
      .from('games')
      .update({ state: nextState, updated_at: new Date().toISOString() })
      .eq('id', gameId)
  }

  const n = game.players.length
  const setupPlayerIndex = getSetupPlayerIndex(game)
  const currentPlayer = game.players[game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex]
  const playerId = currentPlayer?.id ?? 1
  const isMyTurn = (game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex) === myPlayerIndex
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
      if (next.setupPlacements >= 2 * n) next.phase = 'playing'
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
    const nextIndex = (game.currentPlayerIndex + 1) % game.players.length
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

  return (
    <div className="game-page" style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px' }}>
      <GameGuide />
      <h1 className="game-title" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Settlers of Oregon (Multiplayer)</h1>
      <p className="game-subtitle" style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 0 }}>
        {game.phase === 'setup' && !isSetupRoad && `Place a settlement`}
        {game.phase === 'setup' && isSetupRoad && `Place a road next to it`}
        {isPlaying && robberMode.moving && !omenRobberMode && `Rolled 7! Click a hex to move the robber`}
        {isPlaying && robberMode.newHexId && robberMode.playersToRob.size > 0 && `Select a player to rob`}
        {isPlaying && omenRobberMode?.step === 'hex' && `Robber's Regret: click a hex to move the robber`}
        {isPlaying && omenRobberMode?.step === 'player' && `Robber's Regret: select a player to rob (or skip)`}
        {isPlaying && !robberMode.moving && !robberMode.newHexId && !omenRobberMode && (isMyTurn ? 'Roll dice, then build or end turn' : `Waiting for Player ${game.currentPlayerIndex + 1}…`)}
        {winner && `${winner.name} wins with ${winner.victoryPoints} VP!`}
      </p>

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

      <div style={{ position: 'relative' }}>
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
                <button onClick={() => { setErrorMessage(null); sendStateUpdate({ ...game, lastRobbery: null }) }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss">×</button>
              </div>
            )}
          </div>
        </div>

        <div className="game-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div className="game-board" style={{ flex: '1 1 auto', minWidth: 600, borderRadius: 12, overflow: 'visible', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
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
              omenRobberMode?.step === 'hex'
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
        </div>

        <aside className="game-sidebar" style={{ flex: '0 0 280px', background: 'var(--surface)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => setSidebarTab('resources')}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: sidebarTab === 'resources' ? 'none' : '1px solid var(--paper-border, rgba(0, 0, 0, 0.15))',
                borderRadius: 8,
                background: sidebarTab === 'resources' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.15)',
                color: sidebarTab === 'resources' ? '#fff' : 'var(--text)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Resources
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('history')}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: sidebarTab === 'history' ? 'none' : '1px solid var(--paper-border, rgba(0, 0, 0, 0.15))',
                borderRadius: 8,
                background: sidebarTab === 'history' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.15)',
                color: sidebarTab === 'history' ? '#fff' : 'var(--text)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              History
            </button>
          </div>
          {sidebarTab === 'resources' && (
            <>
          <VictoryPointTracker
            vertices={game.vertices}
            players={game.players}
            activePlayerIndex={game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex}
            phase={game.phase}
            longestRoadPlayerId={game.longestRoadPlayerId}
            oregonsOmensEnabled={isOmensEnabled(game)}
            omenHandPlayerId={game.omenHandPlayerId ?? null}
          />
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
                      return { hexId, label: h ? `${TERRAIN_LABELS[h.terrain]} (${h.number})` : hexId }
                    })
                  })()
                : undefined
            }
          />
            </>
          )}
          {sidebarTab === 'history' && (
            <GameHistory gameLog={game.gameLog ?? []} maxHeight={420} />
          )}
          {game.phase === 'setup' && <p style={{ fontSize: 14, color: 'var(--muted)' }}>{isMyTurn ? (!isSetupRoad ? 'Click an empty spot to place a settlement.' : 'Click an edge connected to your settlement to place a road.') : `Waiting for Player ${setupPlayerIndex + 1}…`}</p>}
          {isPlaying && !isMyTurn && <p style={{ fontSize: 14, color: 'var(--muted)' }}>Waiting for Player {game.currentPlayerIndex + 1}…</p>}
          {winner && <a href="/" style={{ padding: '10px 20px', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', marginTop: 8, textAlign: 'center', textDecoration: 'none' }}>Back to home</a>}
        </aside>
        </div>
      </div>
    </div>
  )
}
