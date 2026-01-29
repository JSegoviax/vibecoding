import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { HexBoard } from './HexBoard'
import { PlayerResources } from './PlayerResources'
import { VictoryPointTracker } from './VictoryPointTracker'
import { BuildCostsLegend } from './BuildCostsLegend'
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
  canBuildCity,
  getMissingResources,
  distributeResources,
  giveInitialResources,
  getPlayersOnHex,
  stealResource,
  updateLongestRoad,
  getTradeRate,
} from '../game/logic'
import type { GameState } from '../game/types'
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
  return { ...s, setupPendingVertexId: s.setupPendingVertexId ?? null }
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
  const [diceRolling, setDiceRolling] = useState<{ dice1: number; dice2: number } | null>(null)

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

  const placeableVertices = new Set(
    !isMyTurn ? [] : game.phase === 'setup' && !isSetupRoad
      ? getPlaceableVertices(game, playerId)
      : buildMode === 'settlement'
        ? getPlaceableVertices(game, playerId)
        : []
  )
  const placeableEdges = new Set(
    !isMyTurn ? [] : isSetupRoad && setupPendingVertexId
      ? getPlaceableRoadsForVertex(game, setupPendingVertexId, playerId)
      : buildMode === 'road'
        ? getPlaceableRoads(game, playerId)
        : []
  )
  const placeableCityVertices = new Set(
    !isMyTurn ? [] : buildMode === 'city'
      ? Object.keys(game.vertices).filter(id => canBuildCity(game, id, playerId))
      : []
  )
  const highlightedVertices = new Set([...placeableVertices, ...placeableCityVertices])
  const highlightedEdges = placeableEdges
  const selectableRobberHexes = robberMode.moving
    ? new Set(game.hexes.filter(h => h.id !== game.robberHexId).map(h => h.id))
    : new Set<string>()

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
      sendStateUpdate(next)
      return
    }
    if (game.phase === 'setup' && isSetupRoad) return
    if (buildMode === 'settlement' && canPlaceSettlement(game, vid, playerId)) {
      if (!canAfford(currentPlayer!, 'settlement')) {
        setErrorMessage('Insufficient resources. Need: ' + getMissingResources(currentPlayer!, 'settlement').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
        return
      }
      const cost = { wood: 1, brick: 1, sheep: 1, wheat: 1 }
      const next: GameState = { ...game, vertices: { ...game.vertices } }
      next.vertices[vid] = { ...next.vertices[vid], structure: { player: playerId, type: 'settlement' } }
      next.players = game.players.map((p, i) => {
        if (i !== playerId - 1) return p
        const res = { ...p.resources }
        for (const [t, n] of Object.entries(cost)) (res as Record<string, number>)[t] = Math.max(0, ((res as Record<string, number>)[t] || 0) - (n as number))
        return { ...p, resources: res, settlementsLeft: p.settlementsLeft - 1, victoryPoints: p.victoryPoints + 1 }
      })
      sendStateUpdate(next)
      setBuildMode(null)
      setErrorMessage(null)
    }
    if (buildMode === 'city' && canBuildCity(game, vid, playerId)) {
      if (!currentPlayer || !canAfford(currentPlayer, 'city')) {
        setErrorMessage('Insufficient resources.')
        return
      }
      const cost = { wheat: 2, ore: 3 }
      const next: GameState = { ...game, vertices: { ...game.vertices } }
      const v = next.vertices[vid]
      if (v?.structure) {
        next.vertices[vid] = { ...v, structure: { player: playerId, type: 'city' } }
        next.players = game.players.map((p, i) => {
          if (i !== playerId - 1) return p
          const res = { ...p.resources }
          for (const [t, n] of Object.entries(cost)) (res as Record<string, number>)[t] = Math.max(0, ((res as Record<string, number>)[t] || 0) - (n as number))
          return { ...p, resources: res, settlementsLeft: p.settlementsLeft + 1, citiesLeft: p.citiesLeft - 1, victoryPoints: p.victoryPoints + 1 }
        })
        sendStateUpdate(next)
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
      sendStateUpdate(next)
      return
    }
    if (buildMode === 'road' && canPlaceRoad(game, eid, playerId)) {
      if (!canAfford(currentPlayer!, 'road')) {
        setErrorMessage('Insufficient resources.')
        return
      }
      const next: GameState = { ...game, edges: { ...game.edges } }
      next.edges[eid] = { ...next.edges[eid], road: playerId }
      next.players = game.players.map((p, i) => {
        if (i !== playerId - 1) return p
        const res = { ...p.resources }
        res.wood = Math.max(0, (res.wood || 0) - 1)
        res.brick = Math.max(0, (res.brick || 0) - 1)
        return { ...p, resources: res, roadsLeft: p.roadsLeft - 1 }
      })
      updateLongestRoad(next)
      sendStateUpdate(next)
      setBuildMode(null)
      setErrorMessage(null)
    }
  }

  const handleRoll = () => {
    if (!isMyTurn) return
    const a = 1 + Math.floor(Math.random() * 6)
    const b = 1 + Math.floor(Math.random() * 6)
    setDiceRolling({ dice1: a, dice2: b })
  }

  const handleDiceRollComplete = () => {
    if (!diceRolling) return
    const { dice1, dice2 } = diceRolling
    const sum = dice1 + dice2
    setDiceRolling(null)
    const next: GameState = {
      ...game,
      lastDice: [dice1, dice2] as [number, number],
      players: game.players.map(p => ({ ...p, resources: { ...p.resources } })),
      lastResourceFlash: null,
    }
    if (sum === 7) {
      setRobberMode({ moving: true, newHexId: null, playersToRob: new Set() })
    } else {
      next.lastResourceFlash = distributeResources(next, sum) || null
    }
    sendStateUpdate(next)
  }

  const handleSelectRobberHex = (hexId: string) => {
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
      const next: GameState = { ...game, robberHexId: hexId }
      sendStateUpdate(next)
      setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
      setErrorMessage(null)
    }
  }

  const handleSelectPlayerToRob = (targetPlayerId: number) => {
    if (!robberMode.newHexId) return
    const next: GameState = {
      ...game,
      robberHexId: robberMode.newHexId,
      players: game.players.map(p => ({ ...p, resources: { ...p.resources } })),
    }
    const stolen = stealResource(next, playerId, targetPlayerId) as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | null
    sendStateUpdate(next)
    setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
    setErrorMessage(stolen ? `Stole ${stolen}` : null)
  }

  const handleEndTurn = () => {
    if (!isMyTurn) return
    const next: GameState = {
      ...game,
      currentPlayerIndex: (game.currentPlayerIndex + 1) % game.players.length,
      lastDice: null,
      lastResourceFlash: null,
    }
    sendStateUpdate(next)
    setBuildMode(null)
    setTradeFormOpen(false)
    setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
  }

  const handleTrade = (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', get: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => {
    if (!isMyTurn) return
    const p = game.players[game.currentPlayerIndex]
    if (!p) return
    const tradeRate = getTradeRate(game, playerId, give)
    if ((p.resources[give] || 0) < tradeRate) return
    const next: GameState = {
      ...game,
      players: game.players.map((pl, i) => {
        if (i !== game.currentPlayerIndex) return pl
        const res = { ...pl.resources }
        res[give] = Math.max(0, (res[give] || 0) - tradeRate)
        res[get] = (res[get] || 0) + 1
        return { ...pl, resources: res }
      }),
    }
    sendStateUpdate(next)
    setTradeFormOpen(false)
    setErrorMessage(null)
  }

  const isPlaying = game.phase === 'playing' && !winner

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px' }}>
      <GameGuide />
      <h1 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Settlers of Oregon (Multiplayer)</h1>
      <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 0 }}>
        {game.phase === 'setup' && !isSetupRoad && `Place a settlement`}
        {game.phase === 'setup' && isSetupRoad && `Place a road next to it`}
        {isPlaying && robberMode.moving && `Rolled 7! Click a hex to move the robber`}
        {isPlaying && robberMode.newHexId && robberMode.playersToRob.size > 0 && `Select a player to rob`}
        {isPlaying && !robberMode.moving && !robberMode.newHexId && (isMyTurn ? 'Roll dice, then build or end turn' : `Waiting for Player ${game.currentPlayerIndex + 1}…`)}
        {winner && `${winner.name} wins with ${winner.victoryPoints} VP!`}
      </p>

      {errorMessage && (
        <div role="alert" style={{ margin: '0 auto 16px', maxWidth: 500, padding: '10px 14px', borderRadius: 8, background: 'rgba(185, 28, 28, 0.2)', border: '1px solid rgba(185, 28, 28, 0.5)', color: '#fca5a5', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18 }} aria-label="Dismiss">×</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 auto', minWidth: 600, borderRadius: 12, overflow: 'visible', backgroundColor: '#e0d5c4', border: '3px solid #c4b59a', boxShadow: 'inset 0 0 60px rgba(139,115,85,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <HexBoard
            hexes={game.hexes}
            vertexStates={vertexStates}
            edgeStates={edgeStates}
            selectVertex={isMyTurn ? handleSelectVertex : undefined}
            selectEdge={isMyTurn ? handleSelectEdge : undefined}
            highlightedVertices={highlightedVertices}
            highlightedEdges={highlightedEdges}
            robberHexId={game.robberHexId}
            selectableRobberHexes={selectableRobberHexes}
            selectHex={robberMode.moving ? handleSelectRobberHex : undefined}
            harbors={game.harbors}
            players={game.players.map(p => ({ colorImage: p.colorImage, color: p.color }))}
          />
          {diceRolling && <DiceRollAnimation dice1={diceRolling.dice1} dice2={diceRolling.dice2} onComplete={handleDiceRollComplete} />}
        </div>

        <aside style={{ flex: '0 0 280px', background: 'var(--surface)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <VictoryPointTracker vertices={game.vertices} players={game.players} activePlayerIndex={game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex} phase={game.phase} longestRoadPlayerId={game.longestRoadPlayerId} />
          <PlayerResources
            players={game.players}
            activePlayerIndex={game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex}
            phase={game.phase}
            lastResourceFlash={game.lastResourceFlash}
            lastDice={game.lastDice}
            onRollDice={isPlaying && isMyTurn ? handleRoll : undefined}
            onEndTurn={isPlaying && isMyTurn ? handleEndTurn : undefined}
            robberMode={robberMode}
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
            canAfford={canAfford}
            getMissingResources={getMissingResources}
            getTradeRate={isPlaying && isMyTurn ? (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => getTradeRate(game, playerId, give) : undefined}
          />
          <BuildCostsLegend />
          {game.phase === 'setup' && <p style={{ fontSize: 14, color: 'var(--muted)' }}>{isMyTurn ? (!isSetupRoad ? 'Click an empty spot to place a settlement.' : 'Click an edge connected to your settlement to place a road.') : `Waiting for Player ${setupPlayerIndex + 1}…`}</p>}
          {isPlaying && !isMyTurn && <p style={{ fontSize: 14, color: 'var(--muted)' }}>Waiting for Player {game.currentPlayerIndex + 1}…</p>}
          {robberMode.newHexId && robberMode.playersToRob.size > 0 && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(100,181,246,0.1)', border: '1px solid rgba(100,181,246,0.3)', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Select player to rob:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Array.from(robberMode.playersToRob).map(pid => {
                  const p = game.players[pid - 1]
                  if (!p) return null
                  const totalResources = (p.resources.wood || 0) + (p.resources.brick || 0) + (p.resources.sheep || 0) + (p.resources.wheat || 0) + (p.resources.ore || 0)
                  return (
                    <button key={pid} onClick={() => handleSelectPlayerToRob(pid)} disabled={totalResources === 0} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--muted)', background: 'var(--surface)', color: p.color, cursor: totalResources === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 13, opacity: totalResources === 0 ? 0.5 : 1 }}>
                      {p.name} ({totalResources} resources)
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {winner && <a href="/" style={{ padding: '10px 20px', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', marginTop: 8, textAlign: 'center', textDecoration: 'none' }}>Back to home</a>}
        </aside>
      </div>
    </div>
  )
}
