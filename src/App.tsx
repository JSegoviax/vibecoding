import { useState, useRef, useEffect, Suspense, lazy } from 'react'
import { HexBoard } from './components/HexBoard'
import { PlayerResources } from './components/PlayerResources'
import { VictoryPointTracker } from './components/VictoryPointTracker'
import { GameGuide } from './components/GameGuide'
import { DiceRollAnimation } from './components/DiceRollAnimation'
import { ColorSelection } from './components/ColorSelection'
import { MultiplayerLobby } from './components/MultiplayerLobby'
import { createInitialState } from './game/state'
import { runAISetup, runAITurn, runAITrade, runAIRobberMove, runAISelectPlayerToRob, runAIDrawOmen, runAIPlayOmen } from './game/ai'
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
  getTradeRate,
} from './game/logic'
import {
  canDrawOmenCard,
  drawOmenCard,
  resetPlayerOmensFlagsForNewTurn,
  isOmensEnabled,
  canPlayOmenCard,
  playOmenCard,
  getOmenCardName,
  getOmenCardEffectText,
  getEffectiveBuildCost,
  getBuildCostDebuffSources,
  consumeCostEffectAfterBuild,
  consumeFreeBuildEffect,
  canBuildThisTurn,
  roadIgnoresAdjacencyThisTurn,
  applyProductionModifiersAfterRoll,
  getEffectiveTradeRate,
  consumePathfinderEffect,
  getActiveEffectsForPlayer,
  getActiveEffectDescription,
} from './game/omens'
import type { GameState, PlayerId } from './game/types'
import { TERRAIN_LABELS } from './game/terrain'
import { trackEvent } from './utils/analytics'

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
const FAQPage = lazy(() => import('./pages/FAQPage').then(m => ({ default: m.FAQPage })))
const HowToPlayPage = lazy(() => import('./pages/HowToPlayPage').then(m => ({ default: m.HowToPlayPage })))

type StartScreen = 'mode' | 'ai-count' | 'colors' | 'multiplayer' | 'game'

export default function App() {
  const [startScreen, setStartScreen] = useState<StartScreen>('mode')
  const [, setSelectedColors] = useState<string[]>([])
  const [numPlayers, setNumPlayers] = useState<2 | 3 | 4>(2)
  const showColorSelection = startScreen === 'colors'
  const [game, setGame] = useState<ReturnType<typeof createInitialState> | null>(null)
  const [buildMode, setBuildMode] = useState<'road' | 'settlement' | 'city' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [tradeFormOpen, setTradeFormOpen] = useState(false)
  const [tradeGive, setTradeGive] = useState<'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'>('wood')
  const [tradeGet, setTradeGet] = useState<'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'>('brick')
  const [robberMode, setRobberMode] = useState<{ moving: boolean; newHexId: string | null; playersToRob: Set<number> }>({ moving: false, newHexId: null, playersToRob: new Set() })
  const [omenRobberMode, setOmenRobberMode] = useState<{ cardId: string; step: 'hex' | 'player'; hexId?: string; playersOnHex?: Set<number> } | null>(null)
  const [diceRolling, setDiceRolling] = useState<{ dice1: number; dice2: number } | null>(null)
  const aiNextRoadEdge = useRef<string | null>(null)
  const aiBuildTarget = useRef<{ type: string; vertexId?: string; edgeId?: string } | null>(null)
  const gameWonTrackedRef = useRef(false)

  // Calculate number of human players (in 2-player mode, only player 1 is human)
  const numHumanPlayers = numPlayers === 2 ? 1 : numPlayers

  // SEO: update document title per screen for better discoverability and tabs
  useEffect(() => {
    const titles: Record<StartScreen, string> = {
      mode: 'Settlers of Oregon – Catan-Style Board Game Online',
      colors: 'Settlers of Oregon – Choose Your Color',
      multiplayer: 'Settlers of Oregon – Multiplayer',
      game: 'Settlers of Oregon – Game',
    }
    document.title = titles[startScreen] ?? titles.mode
  }, [startScreen])

  const handleColorsSelected = (colors: string[], options?: { oregonsOmens?: boolean }) => {
    setSelectedColors(colors)
    setGame(createInitialState(numPlayers, colors, { oregonsOmens: options?.oregonsOmens }))
    trackEvent('game_started', 'gameplay', 'single_player', numPlayers)
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
    if (!game || game.phase !== 'setup' || setupPlayerIndex === 0 || setupPendingVertexId) return
    const t = setTimeout(() => {
      try {
        const aiPlayerId = (setupPlayerIndex + 1) as PlayerId
        const { vertexId, edgeId } = runAISetup(game, aiPlayerId)
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

  // AI: playing — roll, then build or end (any AI: index 1, 2, or 3)
  useEffect(() => {
    if (!game || game.phase !== 'playing' || game.currentPlayerIndex === 0 || game.lastDice || winner || diceRolling) return
    const t = setTimeout(() => handleRoll(), 300)
    return () => clearTimeout(t)
  }, [game?.phase, game?.currentPlayerIndex, game?.lastDice, winner, diceRolling])

  // AI: handle robber move when 7 is rolled (any AI)
  useEffect(() => {
    if (!game || game.phase !== 'playing' || game.currentPlayerIndex === 0 || !game.lastDice || game.lastDice[0] + game.lastDice[1] !== 7 || !robberMode.moving || winner) return
    const t = setTimeout(() => {
      const hexId = runAIRobberMove(game)
      handleSelectRobberHex(hexId)
    }, 300)
    return () => clearTimeout(t)
  }, [game?.phase, game?.currentPlayerIndex, game?.lastDice, robberMode.moving, winner])

  // AI: select player to rob
  useEffect(() => {
    if (!game || game.phase !== 'playing' || game.currentPlayerIndex === 0 || !robberMode.newHexId || robberMode.playersToRob.size === 0 || winner) return
    const t = setTimeout(() => {
      const aiPlayerId = (game.currentPlayerIndex + 1) as PlayerId
      const targetPlayerId = runAISelectPlayerToRob(game, robberMode.newHexId!, aiPlayerId)
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
    if (!game || game.phase !== 'playing' || game.currentPlayerIndex === 0 || !game.lastDice || winner || buildMode || robberMode.moving || robberMode.newHexId || omenRobberMode) return
    const t = setTimeout(() => {
      const aiPlayerId = (game.currentPlayerIndex + 1) as PlayerId
      const playOmen = runAIPlayOmen(game, aiPlayerId)
      if (playOmen) {
        setGame(playOmenCard(game, aiPlayerId, playOmen.cardId, playOmen.targets))
        return
      }
      const trade = runAITrade(game, aiPlayerId)
      if (trade) {
        handleTrade(trade.give as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', trade.get as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore')
        return
      }
      const decision = runAITurn(game, aiPlayerId)
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
  }, [game?.phase, game?.currentPlayerIndex, game?.lastDice, game?.players, buildMode, winner, robberMode.moving, robberMode.newHexId, omenRobberMode])

  useEffect(() => {
    if (winner && game && !gameWonTrackedRef.current) {
      gameWonTrackedRef.current = true
      trackEvent('game_won', 'gameplay', winner.name, winner.victoryPoints)
    }
  }, [winner, game])

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

  // Pathname-based routes: /faq, /how-to-play, /game/:id
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const pathMatch = pathname.match(/^\/game\/([a-f0-9-]+)$/i)
  const fallback = <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, rgb(26, 31, 46) 0%, rgb(45, 55, 72) 100%)', color: 'var(--text)' }}>Loading…</div>

  if (pathname === '/faq') {
    return <Suspense fallback={fallback}><FAQPage /></Suspense>
  }
  if (pathname === '/how-to-play') {
    return <Suspense fallback={fallback}><HowToPlayPage /></Suspense>
  }
  if (pathMatch) {
    return (
      <Suspense fallback={fallback}>
        <GameRoom gameId={pathMatch[1]} />
      </Suspense>
    )
  }

  // Now we can do early returns after all hooks are called
  if (startScreen === 'ai-count') {
    return (
      <div
        className="mode-select home-page parchment-page"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: 24,
          background: 'var(--parchment-bg)',
          color: 'var(--ink)',
        }}
      >
        <GameGuide />
        <main
          aria-label="Choose number of AI opponents"
          className="paper-section"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: 0, fontSize: 28 }}>Play vs AI</h1>
          <p style={{ color: 'var(--ink)', opacity: 0.85, margin: 0 }}>How many AI opponents?</p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            {([1, 2, 3] as const).map(count => (
              <button
                key={count}
                className="mode-btn"
                onClick={() => {
                  trackEvent('play_vs_ai_clicked', 'navigation', 'ai_count', count)
                  setNumPlayers((count + 1) as 2 | 3 | 4)
                  setStartScreen('colors')
                }}
                style={{
                  padding: '16px 32px',
                  fontSize: 18,
                  fontWeight: 'bold',
                  background: count === 1 ? 'var(--cta)' : 'var(--accent-sage)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  cursor: 'pointer',
                  boxShadow: count === 1 ? '0 4px 14px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.1)',
                }}
              >
                {count} AI {count === 1 ? 'opponent' : 'opponents'}
              </button>
            ))}
          </div>
          <p style={{ marginTop: 16, fontSize: 14, color: 'var(--ink)', opacity: 0.8 }}>
            <button
              type="button"
              onClick={() => setStartScreen('mode')}
              style={{ background: 'none', border: 'none', color: 'var(--cta)', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}
            >
              ← Back
            </button>
          </p>
        </main>
      </div>
    )
  }

  if (startScreen === 'mode') {
    return (
      <div
        className="mode-select home-page"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: 24,
          background: 'var(--parchment-bg)',
          color: 'var(--ink)',
        }}
      >
        <GameGuide />
        <main
          aria-label="Choose game mode"
          className="paper-section"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: 0, fontSize: 28 }}>Settlers of Oregon</h1>
          <p style={{ color: 'var(--ink)', opacity: 0.85, margin: 0 }}>Choose game mode</p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            className="mode-btn"
            onClick={() => {
              trackEvent('play_vs_ai_clicked', 'navigation', 'mode_select')
              setStartScreen('ai-count')
            }}
            style={{
              padding: '16px 32px',
              fontSize: 18,
              fontWeight: 'bold',
              background: 'var(--cta)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            }}
          >
            Play vs AI
          </button>
          <button
            className="mode-btn"
            onClick={() => {
              trackEvent('multiplayer_clicked', 'navigation', 'mode_select')
              setStartScreen('multiplayer')
            }}
            style={{
              padding: '16px 32px',
              fontSize: 18,
              fontWeight: 'bold',
              background: 'var(--accent-sage)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            Multiplayer
          </button>
        </div>
        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 14, color: 'var(--ink)', opacity: 0.8 }}>
          <a href="/how-to-play" style={{ color: 'var(--cta)', textDecoration: 'none', marginRight: 16 }}>How to play</a>
          <a href="/faq" style={{ color: 'var(--cta)', textDecoration: 'none' }}>FAQ</a>
        </p>
        </main>
      </div>
    )
  }

  if (startScreen === 'multiplayer') {
    return (
      <MultiplayerLobby
        onBack={() => {
          trackEvent('lobby_back', 'navigation', 'multiplayer')
          setStartScreen('mode')
        }}
      />
    )
  }

  if (showColorSelection) {
    return (
      <ColorSelection
        numPlayers={numHumanPlayers}
        onColorsSelected={handleColorsSelected}
        onBack={() => setStartScreen('mode')}
      />
    )
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
  const isAITurn = (game.phase === 'setup' ? actualSetupPlayerIndex !== 0 : game.currentPlayerIndex !== 0)
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
        ? getPlaceableRoads(game, playerId, isOmensEnabled(game) && roadIgnoresAdjacencyThisTurn(game, actualPlayerId as PlayerId))
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

  // Grey out build buttons when player can't afford or has no valid spots (Omens: effective cost + canBuildThisTurn)
  const playingAndMyTurn = game.phase === 'playing' && !actualWinner && !isAITurn
  const roadCost = isOmensEnabled(game) ? getEffectiveBuildCost(game, actualPlayerId as PlayerId, 'road') : getBuildCost('road')
  const settlementCost = isOmensEnabled(game) ? getEffectiveBuildCost(game, actualPlayerId as PlayerId, 'settlement') : getBuildCost('settlement')
  const cityCost = isOmensEnabled(game) ? getEffectiveBuildCost(game, actualPlayerId as PlayerId, 'city') : getBuildCost('city')
  const buildAllowed = !isOmensEnabled(game) || canBuildThisTurn(game, actualPlayerId as PlayerId)
  const canBuildRoad = playingAndMyTurn && buildAllowed && actualCurrentPlayer && canAffordWithCost(actualCurrentPlayer, roadCost) && actualCurrentPlayer.roadsLeft > 0 && getPlaceableRoads(game, actualPlayerId, isOmensEnabled(game) && roadIgnoresAdjacencyThisTurn(game, actualPlayerId as PlayerId)).length > 0
  const canBuildSettlement = playingAndMyTurn && buildAllowed && actualCurrentPlayer && canAffordWithCost(actualCurrentPlayer, settlementCost) && actualCurrentPlayer.settlementsLeft > 0 && getPlaceableVertices(game, actualPlayerId).length > 0
  const hasPlaceableCity = playingAndMyTurn && buildAllowed && actualCurrentPlayer && canAffordWithCost(actualCurrentPlayer, cityCost) && actualCurrentPlayer.citiesLeft > 0 && Object.keys(game.vertices).some(id => canBuildCity(game, id, actualPlayerId))

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
      const cost = isOmensEnabled(game) ? getEffectiveBuildCost(game, actualPlayerId as PlayerId, 'settlement') : getBuildCost('settlement')
      if (!canAffordWithCost(actualCurrentPlayer, cost)) {
        setErrorMessage('Insufficient resources. Need: ' + getMissingResourcesWithCost(actualCurrentPlayer, cost).map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
        return
      }
      trackEvent('build', 'gameplay', 'settlement', 1)
      setGame(g => updateGameState(g, (state) => {
        const next: GameState = {
          ...state,
          vertices: { ...state.vertices },
        }
        next.vertices[vid] = { ...next.vertices[vid], structure: { player: actualPlayerId, type: 'settlement' } }
        next.players = state.players.map((p, i) => {
          if (i !== actualPlayerId - 1) return p
          const res = { ...p.resources }
          for (const [t, n] of Object.entries(cost)) { if (n != null && n > 0) res[t as keyof typeof res] = Math.max(0, (res[t as keyof typeof res] || 0) - n) }
          return { ...p, resources: res, settlementsLeft: p.settlementsLeft - 1, victoryPoints: p.victoryPoints + 1 }
        })
        let result = next as GameState
        if (isOmensEnabled(result)) {
          result = consumeCostEffectAfterBuild(result, actualPlayerId as PlayerId, 'settlement')
          result = consumeFreeBuildEffect(result, actualPlayerId as PlayerId, 'settlement')
        }
        return result
      }))
      setBuildMode(null)
      setErrorMessage(null)
    }
    if (buildMode === 'city' && canBuildCity(game, vid, playerId)) {
      if (!currentPlayer || !canAfford(currentPlayer, 'city')) {
        setErrorMessage('Insufficient resources. Need: ' + (currentPlayer ? getMissingResources(currentPlayer, 'city').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', ') : 'unknown'))
        return
      }
      trackEvent('build', 'gameplay', 'city', 1)
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
      const roadCost = isOmensEnabled(game) ? getEffectiveBuildCost(game, actualPlayerId as PlayerId, 'road') : getBuildCost('road')
      if (!canAffordWithCost(actualCurrentPlayer, roadCost)) {
        setErrorMessage('Insufficient resources. Need: ' + getMissingResourcesWithCost(actualCurrentPlayer, roadCost).map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
        return
      }
      trackEvent('build', 'gameplay', 'road', 1)
      setGame(g => {
        if (!g) return g
        const next: typeof g = { ...g, edges: { ...g.edges } }
        next.edges[eid] = { ...next.edges[eid], road: actualPlayerId }
        next.players = g.players.map((p, i) => {
          if (i !== actualPlayerId - 1) return p
          const res = { ...p.resources }
          for (const [t, n] of Object.entries(roadCost)) { if (n != null && n > 0) res[t as keyof typeof res] = Math.max(0, (res[t as keyof typeof res] || 0) - n) }
          return { ...p, resources: res, roadsLeft: p.roadsLeft - 1 }
        })
        updateLongestRoad(next)
        let result = next
        if (isOmensEnabled(result)) {
          result = consumeCostEffectAfterBuild(result, actualPlayerId as PlayerId, 'road')
          result = consumeFreeBuildEffect(result, actualPlayerId as PlayerId, 'road')
          if (roadIgnoresAdjacencyThisTurn(game, actualPlayerId as PlayerId)) result = consumePathfinderEffect(result, actualPlayerId as PlayerId)
        }
        return result
      })
      setBuildMode(null)
      setErrorMessage(null)
    }
  }

  const handleRoll = () => {
    trackEvent('dice_roll_started', 'gameplay', 'single_player')
    const a = 1 + Math.floor(Math.random() * 6)
    const b = 1 + Math.floor(Math.random() * 6)
    // Start animation
    setDiceRolling({ dice1: a, dice2: b })
  }

  const handleDiceRollComplete = () => {
    if (!diceRolling) return
    const { dice1, dice2 } = diceRolling
    const sum = dice1 + dice2
    trackEvent('dice_rolled', 'gameplay', `sum_${sum}`, sum)
    setGame(g => updateGameState(g, (state) => {
      const next: GameState = {
        ...state,
        lastDice: [dice1, dice2] as [number, number],
        players: state.players.map(p => ({ ...p, resources: { ...p.resources } })),
        lastResourceFlash: null,
      }
      if (sum === 7) {
        setRobberMode({ moving: true, newHexId: null, playersToRob: new Set() })
        next.lastResourceHexIds = []
      } else {
        next.lastResourceFlash = distributeResources(next, sum) || null
        next.lastResourceHexIds = getHexIdsThatProducedResources(next, sum)
      }
      return next
    }))
    // Don't set diceRolling to null - keep dice visible in corner until next roll
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
    // Filter out the current player (can't rob yourself)
    const playersToRob = new Set(Array.from(playersOnHex).filter(pid => pid !== playerId))

    if (playersToRob.size > 0) {
      // Need to select which player to rob
      setRobberMode({ moving: false, newHexId: hexId, playersToRob })
    } else {
      trackEvent('robber_moved', 'gameplay', 'single_player')
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
      lastRobbery: stolen
        ? { robbingPlayerId: actualPlayerId as PlayerId, targetPlayerId: targetPlayerId as PlayerId, resource: stolen }
        : null,
    })))
    setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
    if (stolen) {
      setErrorMessage(null)
    } else {
      setErrorMessage('Target player has no resources to steal')
    }
  }

  const handleEndTurn = () => {
    trackEvent('end_turn', 'gameplay', 'single_player')
    setDiceRolling(null)
    setGame(g =>
      updateGameState(g, (state) => {
        const nextIndex = (state.currentPlayerIndex + 1) % state.players.length
        let next: GameState = {
          ...state,
          currentPlayerIndex: nextIndex,
          lastDice: null,
          lastResourceFlash: null,
          lastResourceHexIds: null,
        }
        next = resetPlayerOmensFlagsForNewTurn(next, nextIndex)
        return next
      })
    )
    setBuildMode(null)
    setTradeFormOpen(false)
    setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
    setOmenRobberMode(null)
  }

  const handleDrawOmenCard = () => {
    if (!game || !canDrawOmenCard(game, actualPlayerId as PlayerId)) return
    setGame(drawOmenCard(game, actualPlayerId as PlayerId))
  }

  const handleTrade = (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', get: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => {
    setGame(g => updateGameState(g, (state) => {
      const idx = state.currentPlayerIndex
      const p = state.players[idx]
      if (!p) return state
      const baseRate = getTradeRate(state, actualPlayerId, give)
      const { rate: tradeRate, stateAfterTrade } = isOmensEnabled(state)
        ? getEffectiveTradeRate(state, actualPlayerId as PlayerId, give, baseRate)
        : { rate: baseRate, stateAfterTrade: undefined }
      if ((p.resources[give] || 0) < tradeRate) return state
      let next: GameState = {
        ...state,
        players: state.players.map((pl, i) => {
          if (i !== idx) return pl
          const res = { ...pl.resources }
          res[give] = Math.max(0, (res[give] || 0) - tradeRate)
          res[get] = (res[get] || 0) + 1
          return { ...pl, resources: res }
        })
      }
      if (stateAfterTrade) next = { ...stateAfterTrade, players: next.players }
      return next
    }))
    setTradeFormOpen(false)
    setErrorMessage(null)
  }

  const isPlaying = game.phase === 'playing' && !actualWinner

  return (
    <div className="game-page parchment-page" style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px' }}>
      <GameGuide />
      <h1 className="game-title" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Settlers of Oregon</h1>
      <p className="game-subtitle" style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 0 }}>
        {game.phase === 'setup' && !isSetupRoad && `Place a settlement`}
        {game.phase === 'setup' && isSetupRoad && `Place a road next to it`}
        {isPlaying && robberMode.moving && !omenRobberMode && `Rolled 7! Click a hex to move the robber`}
        {isPlaying && robberMode.newHexId && robberMode.playersToRob.size > 0 && `Select a player to rob`}
        {isPlaying && omenRobberMode?.step === 'hex' && `Robber's Regret: click a hex to move the robber`}
        {isPlaying && omenRobberMode?.step === 'player' && `Robber's Regret: select a player to rob (or skip)`}
        {isPlaying && !robberMode.moving && !robberMode.newHexId && !omenRobberMode && `Roll dice, then build or end turn`}
        {winner && `${winner.name} wins with ${winner.victoryPoints} VP!`}
      </p>

      {/* Robber's Regret: select player to rob (or skip) */}
      {isPlaying && omenRobberMode?.step === 'player' && omenRobberMode.hexId && (
        <div style={{ margin: '0 auto 16px', maxWidth: 400, padding: 12, borderRadius: 8, background: 'rgba(139,69,19,0.15)', border: '1px solid rgba(139,69,19,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text)', textAlign: 'center' }}>Steal from:</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {Array.from(omenRobberMode.playersOnHex ?? []).map(pid => (
              <button
                key={pid}
                onClick={() => {
                  setGame(playOmenCard(game, actualPlayerId as PlayerId, 'robbers_regret', { hexId: omenRobberMode.hexId, targetPlayerId: pid as PlayerId }))
                  setOmenRobberMode(null)
                }}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--muted)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}
              >
                {game.players[pid - 1]?.name ?? `Player ${pid}`}
              </button>
            ))}
            <button
              onClick={() => {
                setGame(playOmenCard(game, actualPlayerId as PlayerId, 'robbers_regret', { hexId: omenRobberMode.hexId }))
                setOmenRobberMode(null)
              }}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--muted)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}
            >
              Skip (move robber only)
            </button>
          </div>
        </div>
      )}

      {/* Oregon's Omens: debuff feedback (red banner when you drew a debuff) */}
      {game.lastOmenDebuffDrawn && game.lastOmenDebuffDrawn.playerId === 1 && (
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
          <button onClick={() => setGame(g => g ? { ...g, lastOmenDebuffDrawn: null } : g)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss">×</button>
        </div>
      )}

      {(game.lastRobbery || errorMessage) && (
        <div
          role="alert"
          style={{
            margin: '0 auto 16px',
            maxWidth: 500,
            padding: '10px 14px',
            borderRadius: 8,
            ...(game.lastRobbery
              ? (() => {
                  const r = game.lastRobbery!
                  const viewerId = 1 as PlayerId
                  const isRobber = r.robbingPlayerId === viewerId
                  const isVictim = r.targetPlayerId === viewerId
                  const resourceLabel = r.resource ? TERRAIN_LABELS[r.resource] : ''
                  const msg = isRobber ? `You stole ${resourceLabel}` : isVictim ? `${game.players[r.robbingPlayerId - 1]?.name || `Player ${r.robbingPlayerId}`} stole your ${resourceLabel}` : `${game.players[r.robbingPlayerId - 1]?.name || `Player ${r.robbingPlayerId}`} stole ${resourceLabel} from ${game.players[r.targetPlayerId - 1]?.name || `Player ${r.targetPlayerId}`}`
                  if (isRobber) return { background: 'rgba(22, 163, 74, 0.2)', border: '1px solid rgba(22, 163, 74, 0.5)', color: '#86efac' }
                  if (isVictim) return { background: 'rgba(185, 28, 28, 0.2)', border: '1px solid rgba(185, 28, 28, 0.5)', color: '#fca5a5' }
                  return { background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.12)', color: 'var(--text)' }
                })()
              : { background: 'rgba(185, 28, 28, 0.2)', border: '1px solid rgba(185, 28, 28, 0.5)', color: '#fca5a5' }),
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>{game.lastRobbery ? (() => {
            const r = game.lastRobbery!
            const viewerId = 1 as PlayerId
            const isRobber = r.robbingPlayerId === viewerId
            const isVictim = r.targetPlayerId === viewerId
            const resourceLabel = r.resource ? TERRAIN_LABELS[r.resource] : ''
            return isRobber ? `You stole ${resourceLabel}` : isVictim ? `${game.players[r.robbingPlayerId - 1]?.name || `Player ${r.robbingPlayerId}`} stole your ${resourceLabel}` : `${game.players[r.robbingPlayerId - 1]?.name || `Player ${r.robbingPlayerId}`} stole ${resourceLabel} from ${game.players[r.targetPlayerId - 1]?.name || `Player ${r.targetPlayerId}`}`
          })() : errorMessage}</span>
          <button onClick={() => { setErrorMessage(null); setGame(g => g ? { ...g, lastRobbery: null } : g) }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="game-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div
          className="game-board"
          style={{
            flex: '1 1 auto',
            minWidth: 600,
            borderRadius: 12,
            overflow: 'visible',
            backgroundColor: '#e0d5c4',
            backgroundImage: 'url(/harbor-docks.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
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
            resourceHighlightHexIds={game.lastResourceHexIds ? new Set(game.lastResourceHexIds) : undefined}
            robberBlockedHexIds={game.lastDice ? new Set(getHexIdsBlockedByRobber(game, game.lastDice[0] + game.lastDice[1])) : undefined}
          />
          {diceRolling && (
            <DiceRollAnimation
              dice1={diceRolling.dice1}
              dice2={diceRolling.dice2}
              onComplete={handleDiceRollComplete}
            />
          )}
        </div>

        <aside className="game-sidebar" style={{ flex: '0 0 280px', background: 'var(--surface)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                ? (p, s) => canAffordWithCost(p, getEffectiveBuildCost(game, actualPlayerId as PlayerId, s))
                : canAfford
            }
            getMissingResources={
              isOmensEnabled(game)
                ? (p, s) => getMissingResourcesWithCost(p, getEffectiveBuildCost(game, actualPlayerId as PlayerId, s))
                : getMissingResources
            }
            getTradeRate={
              isPlaying && !isAITurn
                ? (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => {
                    const base = getTradeRate(game, actualPlayerId, give)
                    return isOmensEnabled(game)
                      ? getEffectiveTradeRate(game, actualPlayerId as PlayerId, give, base).rate
                      : base
                  }
                : undefined
            }
            canBuildRoad={game.phase === 'playing' ? canBuildRoad : undefined}
            canBuildSettlement={game.phase === 'playing' ? canBuildSettlement : undefined}
            canBuildCity={game.phase === 'playing' ? hasPlaceableCity : undefined}
            oregonsOmensEnabled={isOmensEnabled(game)}
            canDrawOmenCard={isPlaying && !isAITurn ? canDrawOmenCard(game, actualPlayerId as PlayerId) : false}
            onDrawOmenCard={handleDrawOmenCard}
            omensHandCount={actualCurrentPlayer?.omensHand?.length ?? 0}
            omensHand={actualCurrentPlayer?.omensHand ?? []}
            canPlayOmenCard={isPlaying && !isAITurn ? (cardId: string) => canPlayOmenCard(game, actualPlayerId as PlayerId, cardId) : undefined}
            onPlayOmenCard={
              isPlaying && !isAITurn
                ? (cardId: string) => {
                    if (cardId === 'robbers_regret') setOmenRobberMode({ cardId: 'robbers_regret', step: 'hex' })
                    else setGame(playOmenCard(game, actualPlayerId as PlayerId, cardId))
                  }
                : undefined
            }
            getOmenCardName={getOmenCardName}
            getOmenCardEffectText={getOmenCardEffectText}
            activeOmensEffects={isOmensEnabled(game) ? getActiveEffectsForPlayer(game, actualPlayerId as PlayerId) : []}
            getActiveEffectDescription={getActiveEffectDescription}
            getEffectiveBuildCostForPlayer={isOmensEnabled(game) ? (pid, structure) => getEffectiveBuildCost(game, pid as PlayerId, structure) : undefined}
            getBuildCostDebuffSourcesForPlayer={isOmensEnabled(game) ? (pid) => getBuildCostDebuffSources(game, pid as PlayerId) : undefined}
          />

          {game.phase === 'setup' && (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>
              {isAITurn ? `${actualCurrentPlayer?.name ?? 'AI'} is placing…` : !isSetupRoad ? 'Click an empty spot to place a settlement.' : 'Click an edge connected to your settlement to place a road.'}
            </p>
          )}

          {isPlaying && isAITurn && (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>
              {game.lastDice ? `${actualCurrentPlayer?.name ?? 'AI'} rolled ${game.lastDice[0]} + ${game.lastDice[1]} = ${game.lastDice[0] + game.lastDice[1]}` : `${actualCurrentPlayer?.name ?? 'AI'} is thinking…`}
            </p>
          )}

          {actualWinner && (
            <button
              onClick={() => {
                trackEvent('new_game', 'gameplay', 'single_player')
                gameWonTrackedRef.current = false
                setGame(createInitialState(2))
                setBuildMode(null)
              }}
              style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 'bold', cursor: 'pointer', marginTop: 8 }}
            >New game</button>
          )}
        </aside>
      </div>
    </div>
  )
}
