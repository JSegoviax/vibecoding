import { useState, useRef, useEffect, Suspense, lazy } from 'react'
import { HexBoard } from './components/HexBoard'
import { PlayerResources } from './components/PlayerResources'
import { VictoryPointTracker } from './components/VictoryPointTracker'
import { BuildCostsLegend } from './components/BuildCostsLegend'
import { GameGuide } from './components/GameGuide'
import { DiceRollAnimation } from './components/DiceRollAnimation'
import { ColorSelection } from './components/ColorSelection'
import { MultiplayerLobby } from './components/MultiplayerLobby'
import { createInitialState } from './game/state'
import { runAISetup, runAITurn, runAITrade, runAIRobberMove, runAISelectPlayerToRob } from './game/ai'
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
} from './game/logic'
import type { GameState } from './game/types'
import { TERRAIN_LABELS } from './game/terrain'

const SETUP_ORDER: Record<number, number[]> = {
  2: [0, 1, 1, 0],
  3: [0, 1, 2, 2, 1, 0],
  4: [0, 1, 2, 3, 3, 2, 1, 0],
}

function getSetupPlayerIndex(state: { phase: string; setupPlacements: number; players: unknown[] }): number {
  const n = state.players.length
  const order = SETUP_ORDER[n as 2 | 3 | 4] ?? SETUP_ORDER[2]
  return order[Math.min(state.setupPlacements, order.length - 1)] ?? 0
}

// Helper to ensure GameState is properly typed when updating
function updateGameState(g: GameState | null, updater: (state: GameState) => GameState): GameState | null {
  if (!g) return g
  return updater(g)
}

const GameRoom = lazy(() => import('./components/GameRoom').then(m => ({ default: m.GameRoom })))

type StartScreen = 'mode' | 'colors' | 'multiplayer' | 'game'

export default function App() {
  const [startScreen, setStartScreen] = useState<StartScreen>('mode')
  const [, setSelectedColors] = useState<string[]>([])
  const [numPlayers] = useState<2 | 3 | 4>(2)
  const showColorSelection = startScreen === 'colors'
  const [game, setGame] = useState<ReturnType<typeof createInitialState> | null>(null)
  const [buildMode, setBuildMode] = useState<'road' | 'settlement' | 'city' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [tradeFormOpen, setTradeFormOpen] = useState(false)
  const [tradeGive, setTradeGive] = useState<'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'>('wood')
  const [tradeGet, setTradeGet] = useState<'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'>('brick')
  const [robberMode, setRobberMode] = useState<{ moving: boolean; newHexId: string | null; playersToRob: Set<number> }>({ moving: false, newHexId: null, playersToRob: new Set() })
  const [diceRolling, setDiceRolling] = useState<{ dice1: number; dice2: number } | null>(null)
  const aiNextRoadEdge = useRef<string | null>(null)
  const aiBuildTarget = useRef<{ type: string; vertexId?: string; edgeId?: string } | null>(null)

  // Calculate number of human players (in 2-player mode, only player 1 is human)
  const numHumanPlayers = numPlayers === 2 ? 1 : numPlayers

  const handleColorsSelected = (colors: string[]) => {
    setSelectedColors(colors)
    setGame(createInitialState(numPlayers, colors))
    setStartScreen('game')
  }

  // All hooks must be called before any early returns to avoid React hooks violations
  // Calculate derived values safely (will be recalculated when game is set)
  const n = game?.players.length ?? 0
  const setupPlayerIndex = game ? getSetupPlayerIndex(game) : 0
  const currentPlayer = game?.players[game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex]
  const playerId = currentPlayer?.id ?? 1
  const winner = game?.players.find(p => p.victoryPoints >= 10)

  const setupPendingVertexId = game?.setupPendingVertexId ?? null

  // AI: setup — place settlement then road
  useEffect(() => {
    if (!game || game.phase !== 'setup' || setupPlayerIndex !== 1 || setupPendingVertexId) return
    const t = setTimeout(() => {
      try {
        const { vertexId, edgeId } = runAISetup(game)
        aiNextRoadEdge.current = edgeId
        handleSelectVertex(vertexId)
      } catch {
        aiNextRoadEdge.current = null
      }
    }, 300)
    return () => clearTimeout(t)
  }, [game?.phase, game?.setupPlacements, setupPendingVertexId])

  useEffect(() => {
    if (!setupPendingVertexId || !aiNextRoadEdge.current) return
    const t = setTimeout(() => {
      const eid = aiNextRoadEdge.current
      aiNextRoadEdge.current = null
      if (eid && game) handleSelectEdge(eid)
    }, 200)
    return () => clearTimeout(t)
  }, [setupPendingVertexId])

  // AI: playing — roll, then build or end
  useEffect(() => {
    if (!game || game.phase !== 'playing' || game.currentPlayerIndex !== 1 || game.lastDice || winner || diceRolling) return
    const t = setTimeout(() => handleRoll(), 300)
    return () => clearTimeout(t)
  }, [game?.phase, game?.currentPlayerIndex, game?.lastDice, winner, diceRolling])

  // AI: handle robber move when 7 is rolled
  useEffect(() => {
    if (!game || game.phase !== 'playing' || game.currentPlayerIndex !== 1 || !game.lastDice || game.lastDice[0] + game.lastDice[1] !== 7 || !robberMode.moving || winner) return
    const t = setTimeout(() => {
      const hexId = runAIRobberMove(game)
      handleSelectRobberHex(hexId)
    }, 300)
    return () => clearTimeout(t)
  }, [game?.phase, game?.currentPlayerIndex, game?.lastDice, robberMode.moving, winner])

  // AI: select player to rob
  useEffect(() => {
    if (!game || game.phase !== 'playing' || game.currentPlayerIndex !== 1 || !robberMode.newHexId || robberMode.playersToRob.size === 0 || winner) return
    const t = setTimeout(() => {
      const targetPlayerId = runAISelectPlayerToRob(game, robberMode.newHexId!)
      if (targetPlayerId) {
        handleSelectPlayerToRob(targetPlayerId)
      } else {
        // No valid player to rob, just move the robber
        setGame(g => updateGameState(g, (state) => ({
          ...state,
          robberHexId: robberMode.newHexId!,
        })))
        setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
      }
    }, 300)
    return () => clearTimeout(t)
  }, [robberMode.newHexId, robberMode.playersToRob, game?.phase, game?.currentPlayerIndex, winner])

  useEffect(() => {
    if (!game || game.phase !== 'playing' || game.currentPlayerIndex !== 1 || !game.lastDice || winner || buildMode || robberMode.moving || robberMode.newHexId) return
    const t = setTimeout(() => {
      const trade = runAITrade(game)
      if (trade) {
        handleTrade(trade.give as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', trade.get as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore')
        return
      }
      const decision = runAITurn(game)
      if (decision.action === 'end') {
        handleEndTurn()
      } else {
        setBuildMode(decision.action as 'road' | 'settlement' | 'city')
        aiBuildTarget.current = {
          type: decision.action,
          vertexId: 'vertexId' in decision ? decision.vertexId : undefined,
          edgeId: 'edgeId' in decision ? decision.edgeId : undefined,
        }
      }
    }, 400)
    return () => clearTimeout(t)
  }, [game?.phase, game?.currentPlayerIndex, game?.lastDice, game?.players, buildMode, winner, robberMode.moving, robberMode.newHexId])

  useEffect(() => {
    if (!buildMode || !aiBuildTarget.current || !game) return
    const target = aiBuildTarget.current
    if (target.type === 'settlement' && target.vertexId) {
      const t = setTimeout(() => {
        handleSelectVertex(target.vertexId!)
        aiBuildTarget.current = null
      }, 200)
      return () => clearTimeout(t)
    }
    if (target.type === 'road' && target.edgeId) {
      const t = setTimeout(() => {
        handleSelectEdge(target.edgeId!)
        aiBuildTarget.current = null
      }, 200)
      return () => clearTimeout(t)
    }
    if (target.type === 'city' && target.vertexId) {
      const t = setTimeout(() => {
        handleSelectVertex(target.vertexId!)
        aiBuildTarget.current = null
      }, 200)
      return () => clearTimeout(t)
    }
  }, [buildMode])

  useEffect(() => {
    if (!game) return
    updateLongestRoad(game)
  }, [game?.edges, game?.vertices])

  // Pathname-based route: /game/:id shows the multiplayer game room (lobby or started)
  const pathMatch = typeof window !== 'undefined' && window.location.pathname.match(/^\/game\/([a-f0-9-]+)$/i)
  if (pathMatch) {
    return (
      <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, rgb(26, 31, 46) 0%, rgb(45, 55, 72) 100%)', color: 'var(--text)' }}>Loading…</div>}>
        <GameRoom gameId={pathMatch[1]} />
      </Suspense>
    )
  }

  // Now we can do early returns after all hooks are called
  if (startScreen === 'mode') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: 24,
          background: 'linear-gradient(180deg, rgb(26, 31, 46) 0%, rgb(45, 55, 72) 100%)',
          color: 'var(--text)',
        }}
      >
        <GameGuide />
        <h1 style={{ margin: 0, fontSize: 28 }}>Settlers of Oregon</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Choose how to play</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => setStartScreen('colors')}
            style={{
              padding: '16px 32px',
              fontSize: 18,
              fontWeight: 'bold',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
            }}
          >
            Play vs AI
          </button>
          <button
            onClick={() => setStartScreen('multiplayer')}
            style={{
              padding: '16px 32px',
              fontSize: 18,
              fontWeight: 'bold',
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '2px solid var(--muted)',
              borderRadius: 12,
              cursor: 'pointer',
            }}
          >
            Multiplayer
          </button>
        </div>
      </div>
    )
  }

  if (startScreen === 'multiplayer') {
    return (
      <MultiplayerLobby onBack={() => setStartScreen('mode')} />
    )
  }

  if (showColorSelection) {
    return <ColorSelection numPlayers={numHumanPlayers} onColorsSelected={handleColorsSelected} />
  }

  if (!game) {
    return <div>Loading...</div>
  }

  // Calculate these values now that we know game exists
  const actualSetupPlayerIndex = getSetupPlayerIndex(game)
  const actualCurrentPlayer = game.players[game.phase === 'setup' ? actualSetupPlayerIndex : game.currentPlayerIndex]
  const actualPlayerId = actualCurrentPlayer?.id ?? 1
  const actualWinner = game.players.find(p => p.victoryPoints >= 10)

  const vertexStates: Record<string, { player: number; type: 'settlement' | 'city' }> = {}
  const edgeStates: Record<string, number> = {}
  for (const [id, v] of Object.entries(game.vertices)) {
    if (v.structure) vertexStates[id] = { player: v.structure.player, type: v.structure.type }
  }
  for (const [id, e] of Object.entries(game.edges)) {
    if (e.road) edgeStates[id] = e.road
  }

  const isSetupRoad = game.phase === 'setup' && setupPendingVertexId != null
  const isAITurn = n === 2 && (game.phase === 'setup' ? actualSetupPlayerIndex === 1 : game.currentPlayerIndex === 1)
  const placeableVertices = new Set(
    isAITurn ? [] : game.phase === 'setup' && !isSetupRoad
      ? getPlaceableVertices(game, playerId)
      : buildMode === 'settlement'
        ? getPlaceableVertices(game, playerId)
        : []
  )
  const placeableEdges = new Set(
    isAITurn ? [] : isSetupRoad && setupPendingVertexId
      ? getPlaceableRoadsForVertex(game, setupPendingVertexId, playerId)
      : buildMode === 'road'
        ? getPlaceableRoads(game, playerId)
        : []
  )
  const placeableCityVertices = new Set(
    isAITurn ? [] : buildMode === 'city'
      ? Object.keys(game.vertices).filter(id => canBuildCity(game, id, playerId))
      : []
  )
  const highlightedVertices = new Set([...placeableVertices, ...placeableCityVertices])
  const highlightedEdges = placeableEdges
  // Hexes that can be selected for robber (all except current robber hex)
  const selectableRobberHexes = robberMode.moving
    ? new Set(game.hexes.filter(h => h.id !== game.robberHexId).map(h => h.id))
    : new Set<string>()

  const handleSelectVertex = (vid: string) => {
    if (game.phase === 'setup' && !isSetupRoad) {
      if (!canPlaceSettlement(game, vid, actualPlayerId)) return
      setGame(g => {
        if (!g) return g
        const next: GameState = { ...g, vertices: { ...g.vertices }, setupPendingVertexId: vid }
        next.vertices[vid] = { ...next.vertices[vid], structure: { player: playerId, type: 'settlement' } }
        next.players = g.players.map((p, i) =>
          i === playerId - 1 ? { ...p, resources: { ...p.resources }, settlementsLeft: p.settlementsLeft - 1, victoryPoints: p.victoryPoints + 1 } : p
        )
        if (g.setupPlacements >= n) giveInitialResources(next, vid)
        return next
      })
      return
    }
    if (game.phase === 'setup' && isSetupRoad) return

    if (buildMode === 'settlement' && canPlaceSettlement(game, vid, actualPlayerId)) {
      if (!canAfford(actualCurrentPlayer, 'settlement')) {
        setErrorMessage('Insufficient resources. Need: ' + getMissingResources(actualCurrentPlayer, 'settlement').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
        return
      }
      setGame(g => updateGameState(g, (state) => {
        const cost = { wood: 1, brick: 1, sheep: 1, wheat: 1 }
        const next: GameState = {
          ...state,
          vertices: { ...state.vertices },
        }
        next.vertices[vid] = { ...next.vertices[vid], structure: { player: actualPlayerId, type: 'settlement' } }
        next.players = state.players.map((p, i) => {
          if (i !== actualPlayerId - 1) return p
          const res = { ...p.resources }
          for (const [t, n] of Object.entries(cost)) { res[t as keyof typeof res] = Math.max(0, (res[t as keyof typeof res] || 0) - n!) }
          return { ...p, resources: res, settlementsLeft: p.settlementsLeft - 1, victoryPoints: p.victoryPoints + 1 }
        })
        return next
      }))
      setBuildMode(null)
      setErrorMessage(null)
    }
    if (buildMode === 'city' && canBuildCity(game, vid, playerId)) {
      if (!currentPlayer || !canAfford(currentPlayer, 'city')) {
        setErrorMessage('Insufficient resources. Need: ' + (currentPlayer ? getMissingResources(currentPlayer, 'city').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', ') : 'unknown'))
        return
      }
      setGame(g => updateGameState(g, (state) => {
        const cost = { wheat: 2, ore: 3 }
        const next: GameState = {
          ...state,
          vertices: { ...state.vertices },
        }
        const v = next.vertices[vid]
        if (v?.structure) {
          next.vertices[vid] = { ...v, structure: { player: playerId, type: 'city' } }
          next.players = state.players.map((p, i) => {
            if (i !== playerId - 1) return p
            const res = { ...p.resources }
            for (const [t, n] of Object.entries(cost)) { res[t as keyof typeof res] = Math.max(0, (res[t as keyof typeof res] || 0) - n!) }
            return { ...p, resources: res, settlementsLeft: p.settlementsLeft + 1, citiesLeft: p.citiesLeft - 1, victoryPoints: p.victoryPoints + 1 }
          })
        }
        return next
      }))
      setBuildMode(null)
      setErrorMessage(null)
    }
  }

  const handleSelectEdge = (eid: string) => {
    if (game.phase === 'setup' && isSetupRoad && setupPendingVertexId) {
      if (!canPlaceRoadInSetup(game, eid, actualPlayerId, setupPendingVertexId)) return
      setGame(g => {
        if (!g) return g
        const next: GameState = {
          ...g,
          edges: { ...g.edges },
          setupPendingVertexId: null,
        }
        next.edges[eid] = { ...next.edges[eid], road: actualPlayerId }
        next.players = g.players.map((p, i) =>
          i === actualPlayerId - 1 ? { ...p, roadsLeft: p.roadsLeft - 1 } : p
        )
        next.setupPlacements = (next.setupPlacements || 0) + 1
        if (next.setupPlacements >= 2 * n) next.phase = 'playing'
        updateLongestRoad(next)
        return next
      })
      return
    }
    if (buildMode === 'road' && canPlaceRoad(game, eid, actualPlayerId)) {
      if (!canAfford(actualCurrentPlayer, 'road')) {
        setErrorMessage('Insufficient resources. Need: ' + getMissingResources(actualCurrentPlayer, 'road').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
        return
      }
      setGame(g => {
        if (!g) return g
        const next: typeof g = { ...g, edges: { ...g.edges } }
        next.edges[eid] = { ...next.edges[eid], road: actualPlayerId }
        next.players = g.players.map((p, i) => {
          if (i !== actualPlayerId - 1) return p
          const res = { ...p.resources }
          res.wood = Math.max(0, (res.wood || 0) - 1)
          res.brick = Math.max(0, (res.brick || 0) - 1)
          return { ...p, resources: res, roadsLeft: p.roadsLeft - 1 }
        })
        updateLongestRoad(next)
        return next
      })
      setBuildMode(null)
      setErrorMessage(null)
    }
  }

  const handleRoll = () => {
    const a = 1 + Math.floor(Math.random() * 6)
    const b = 1 + Math.floor(Math.random() * 6)
    // Start animation
    setDiceRolling({ dice1: a, dice2: b })
  }

  const handleDiceRollComplete = () => {
    if (!diceRolling) return
    const { dice1, dice2 } = diceRolling
    const sum = dice1 + dice2
    setGame(g => updateGameState(g, (state) => {
      const next: GameState = {
        ...state,
        lastDice: [dice1, dice2] as [number, number],
        players: state.players.map(p => ({ ...p, resources: { ...p.resources } })),
        lastResourceFlash: null,
      }
      if (sum === 7) {
        // Enable robber mode
        setRobberMode({ moving: true, newHexId: null, playersToRob: new Set() })
      } else {
        next.lastResourceFlash = distributeResources(next, sum) || null
      }
      return next
    }))
    // Don't set diceRolling to null - keep dice visible in corner until next roll
  }

  const handleSelectRobberHex = (hexId: string) => {
    if (!robberMode.moving) return
    if (hexId === game.robberHexId) {
      setErrorMessage('Robber must move to a different hex')
      return
    }

    const playersOnHex = getPlayersOnHex(game, hexId)
    // Filter out the current player (can't rob yourself)
    const playersToRob = new Set(Array.from(playersOnHex).filter(pid => pid !== playerId))

    if (playersToRob.size > 0) {
      // Need to select which player to rob
      setRobberMode({ moving: false, newHexId: hexId, playersToRob })
    } else {
      // No players to rob, just move the robber
      setGame(g => updateGameState(g, (state) => ({
        ...state,
        robberHexId: hexId,
      })))
      setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
      setErrorMessage(null)
    }
  }

  const handleSelectPlayerToRob = (targetPlayerId: number) => {
    if (!robberMode.newHexId) return

      const stolen = stealResource(game, actualPlayerId, targetPlayerId) as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | null
    setGame(g => updateGameState(g, (state) => ({
      ...state,
      robberHexId: robberMode.newHexId!,
    })))
    setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
    if (stolen) {
      setErrorMessage(`Stole ${stolen} from ${game.players[targetPlayerId - 1]?.name || 'player'}`)
    } else {
      setErrorMessage('Target player has no resources to steal')
    }
  }

  const handleEndTurn = () => {
    // Clear diceRolling when turn ends so next player can roll
    setDiceRolling(null)
    setGame(g => updateGameState(g, (state) => ({
      ...state,
      currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
      lastDice: null,
      lastResourceFlash: null,
    })))
    setBuildMode(null)
    setTradeFormOpen(false)
    setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
  }

  const handleTrade = (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', get: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => {
    setGame(g => updateGameState(g, (state) => {
      const idx = state.currentPlayerIndex
      const p = state.players[idx]
      if (!p) return state
      
      // Get the trade rate based on harbors
      const tradeRate = getTradeRate(state, actualPlayerId, give)
      if ((p.resources[give] || 0) < tradeRate) return state
      
      const next: GameState = {
        ...state,
        players: state.players.map((pl, i) => {
          if (i !== idx) return pl
          const res = { ...pl.resources }
          res[give] = Math.max(0, (res[give] || 0) - tradeRate)
          res[get] = (res[get] || 0) + 1
          return { ...pl, resources: res }
        })
      }
      return next
    }))
    setTradeFormOpen(false)
    setErrorMessage(null)
  }

  const isPlaying = game.phase === 'playing' && !actualWinner

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px' }}>
      <GameGuide />
      <h1 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Settlers of Oregon</h1>
      <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 0 }}>
        {game.phase === 'setup' && !isSetupRoad && `Place a settlement`}
        {game.phase === 'setup' && isSetupRoad && `Place a road next to it`}
        {isPlaying && robberMode.moving && `Rolled 7! Click a hex to move the robber`}
        {isPlaying && robberMode.newHexId && robberMode.playersToRob.size > 0 && `Select a player to rob`}
        {isPlaying && !robberMode.moving && !robberMode.newHexId && `Roll dice, then build or end turn`}
        {winner && `${winner.name} wins with ${winner.victoryPoints} VP!`}
      </p>

      {errorMessage && (
        <div
          role="alert"
          style={{
            margin: '0 auto 16px',
            maxWidth: 500,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(185, 28, 28, 0.2)',
            border: '1px solid rgba(185, 28, 28, 0.5)',
            color: '#fca5a5',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss">×</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div
          style={{
            flex: '1 1 auto',
            minWidth: 600,
            borderRadius: 12,
            overflow: 'visible',
            backgroundColor: '#e0d5c4',
            border: '3px solid #c4b59a',
            boxShadow: 'inset 0 0 60px rgba(139,115,85,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <HexBoard
            hexes={game.hexes}
            vertexStates={vertexStates}
            edgeStates={edgeStates}
            selectVertex={isAITurn ? undefined : handleSelectVertex}
            selectEdge={isAITurn ? undefined : handleSelectEdge}
            highlightedVertices={highlightedVertices}
            highlightedEdges={highlightedEdges}
            robberHexId={game.robberHexId}
            selectableRobberHexes={selectableRobberHexes}
            selectHex={robberMode.moving ? handleSelectRobberHex : undefined}
            harbors={game.harbors}
            players={game.players.map(p => ({ colorImage: p.colorImage, color: p.color }))}
          />
          {diceRolling && (
            <DiceRollAnimation
              dice1={diceRolling.dice1}
              dice2={diceRolling.dice2}
              onComplete={handleDiceRollComplete}
            />
          )}
        </div>

        <aside style={{ flex: '0 0 280px', background: 'var(--surface)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <VictoryPointTracker
            vertices={game.vertices}
            players={game.players}
            activePlayerIndex={game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex}
            phase={game.phase}
            longestRoadPlayerId={game.longestRoadPlayerId}
          />

          <PlayerResources
            players={game.players}
            activePlayerIndex={game.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex}
            phase={game.phase}
            lastResourceFlash={game.lastResourceFlash}
            lastDice={game.lastDice}
            onRollDice={isPlaying && !isAITurn ? handleRoll : undefined}
            onEndTurn={isPlaying && !isAITurn ? handleEndTurn : undefined}
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
            getTradeRate={isPlaying && !isAITurn ? (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => getTradeRate(game, actualPlayerId, give) : undefined}
          />

          <BuildCostsLegend />

          {game.phase === 'setup' && (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>
              {isAITurn ? 'Player 2 (AI) is placing…' : !isSetupRoad ? 'Click an empty spot to place a settlement.' : 'Click an edge connected to your settlement to place a road.'}
            </p>
          )}

          {isPlaying && isAITurn && (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>
              {game.lastDice ? `Player 2 (AI) rolled ${game.lastDice[0]} + ${game.lastDice[1]} = ${game.lastDice[0] + game.lastDice[1]}` : 'Player 2 (AI) is thinking…'}
            </p>
          )}

          {robberMode.newHexId && robberMode.playersToRob.size > 0 && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(100,181,246,0.1)', border: '1px solid rgba(100,181,246,0.3)', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Select player to rob:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Array.from(robberMode.playersToRob).map(pid => {
                  const p = game.players[pid - 1]
                  if (!p) return null
                  const totalResources = (p.resources.wood || 0) + (p.resources.brick || 0) + (p.resources.sheep || 0) + (p.resources.wheat || 0) + (p.resources.ore || 0)
                  return (
                    <button
                      key={pid}
                      onClick={() => handleSelectPlayerToRob(pid)}
                      disabled={totalResources === 0}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid var(--muted)',
                        background: 'var(--surface)',
                        color: p.color,
                        cursor: totalResources === 0 ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: 13,
                        opacity: totalResources === 0 ? 0.5 : 1,
                      }}
                    >
                      {p.name} ({totalResources} resources)
                    </button>
                  )
                })}
              </div>
            </div>
          )}


          {actualWinner && (
            <button
              onClick={() => { setGame(createInitialState(2)); setBuildMode(null); }}
              style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 'bold', cursor: 'pointer', marginTop: 8 }}
            >New game</button>
          )}
        </aside>
      </div>
    </div>
  )
}
