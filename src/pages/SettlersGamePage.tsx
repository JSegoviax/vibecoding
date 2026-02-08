import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { HexBoard } from '../components/HexBoard'
import { PlayerResources } from '../components/PlayerResources'
import { VictoryPointTracker } from '../components/VictoryPointTracker'
import { GameGuide } from '../components/GameGuide'
import { DiceRollAnimation } from '../components/DiceRollAnimation'
import { GameHistory } from '../components/GameHistory'
import { ColorSelection } from '../components/ColorSelection'
import { MultiplayerLobby } from '../components/MultiplayerLobby'
import { createInitialState, appendGameLog } from '../game/state'
import { runAISetup, runAITurn, runAITrade, runAIRobberMove, runAISelectPlayerToRob, runAIDrawOmen, runAIPlayOmen } from '../game/ai'
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
  getHexesForFarmSwap,
  applyProductionModifiersAfterRoll,
  getEffectiveTradeRate,
  consumePathfinderEffect,
  getActiveEffectsForPlayer,
  getActiveEffectDescription,
  TOTAL_OMEN_DECK_SIZE,
} from '../game/omens'
import type { PlayOmenTargets } from '../game/omens'
import type { GameState, PlayerId } from '../game/types'
import { TERRAIN_LABELS } from '../game/terrain'
import { trackEvent } from '../utils/analytics'

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

type StartScreen = 'mode' | 'ai-count' | 'colors' | 'multiplayer' | 'game'

export function SettlersGamePage() {
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
  const [sidebarTab, setSidebarTab] = useState<'resources' | 'history'>('resources')
  const aiNextRoadEdge = useRef<string | null>(null)
  const aiBuildTarget = useRef<{ type: string; vertexId?: string; edgeId?: string } | null>(null)
  const gameWonTrackedRef = useRef(false)

  // Calculate number of human players (in 2-player mode, only player 1 is human)
  const numHumanPlayers = numPlayers === 2 ? 1 : numPlayers

  // SEO: update document title per screen for better discoverability and tabs
  useEffect(() => {
    const titles: Record<StartScreen, string> = {
      mode: 'Settlers of Oregon – Catan-Style Board Game Online',
      'ai-count': 'Settlers of Oregon – Play vs AI',
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
      if (runAIDrawOmen(game, aiPlayerId)) {
        setGame(g => {
          if (!g) return g
          const next = drawOmenCard(g, aiPlayerId)
          updateOmenHand(next)
          return next
        })
        return
      }
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

  // Auto-dismiss game toasts after 5s so they fade away
  const toastAutoDismissMs = 5000
  useEffect(() => {
    if (!game) return
    const hasToast = (game.lastOmenDebuffDrawn && game.lastOmenDebuffDrawn.playerId === 1) ||
      (game.lastOmenBuffPlayed && game.lastOmenBuffPlayed.playerId === 1) ||
      (game.lastPantryNegation && game.lastPantryNegation.playerId === 1) ||
      game.lastRobbery ||
      !!errorMessage
    if (!hasToast) return
    const t = setTimeout(() => {
      setGame(g => {
        if (!g) return g
        const next = { ...g }
        let changed = false
        if (g.lastOmenDebuffDrawn && g.lastOmenDebuffDrawn.playerId === 1) { next.lastOmenDebuffDrawn = null; changed = true }
        if (g.lastOmenBuffPlayed && g.lastOmenBuffPlayed.playerId === 1) { next.lastOmenBuffPlayed = null; changed = true }
        if (g.lastPantryNegation && g.lastPantryNegation.playerId === 1) { next.lastPantryNegation = null; changed = true }
        if (g.lastRobbery) { next.lastRobbery = null; changed = true }
        return changed ? next : g
      })
      setErrorMessage(null)
    }, toastAutoDismissMs)
    return () => clearTimeout(t)
  }, [game?.lastOmenDebuffDrawn, game?.lastOmenBuffPlayed, game?.lastPantryNegation, game?.lastRobbery, errorMessage])

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

  // Early returns for mode screens
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
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginTop: 28 }}>
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
          <Link to="/games" style={{ color: 'var(--cta)', textDecoration: 'none', marginRight: 16 }}>← Games</Link>
          <Link to="/how-to-play" style={{ color: 'var(--cta)', textDecoration: 'none', marginRight: 16 }}>How to play</Link>
          <Link to="/about" style={{ color: 'var(--cta)', textDecoration: 'none', marginRight: 16 }}>About</Link>
          <Link to="/faq" style={{ color: 'var(--cta)', textDecoration: 'none' }}>FAQ</Link>
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
        isVsAIMode
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
  const inRobberFlow = robberMode.moving || robberMode.newHexId != null
  const placeableVertices = new Set(
    isAITurn || inRobberFlow ? [] : game.phase === 'setup' && !isSetupRoad
      ? getPlaceableVertices(game, playerId)
      : buildMode === 'settlement'
        ? getPlaceableVertices(game, playerId)
        : []
  )
  const placeableEdges = new Set(
    isAITurn || inRobberFlow ? [] : isSetupRoad && setupPendingVertexId
      ? getPlaceableRoadsForVertex(game, setupPendingVertexId, playerId)
      : buildMode === 'road'
        ? getPlaceableRoads(game, playerId, isOmensEnabled(game) && roadIgnoresAdjacencyThisTurn(game, actualPlayerId as PlayerId))
        : []
  )
  const placeableCityVertices = new Set(
    isAITurn || inRobberFlow ? [] : buildMode === 'city'
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
        return appendGameLog(next, { type: 'setup', message: `Player ${playerId} placed settlement (setup)` })
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
      setGame(g => {
        const next = updateGameState(g, (state) => {
          const nextState: GameState = {
            ...state,
            vertices: { ...state.vertices },
          }
          nextState.vertices[vid] = { ...nextState.vertices[vid], structure: { player: actualPlayerId, type: 'settlement' } }
          nextState.players = state.players.map((p, i) => {
            if (i !== actualPlayerId - 1) return p
            const res = { ...p.resources }
            for (const [t, n] of Object.entries(cost)) { if (n != null && n > 0) res[t as keyof typeof res] = Math.max(0, (res[t as keyof typeof res] || 0) - n) }
            return { ...p, resources: res, settlementsLeft: p.settlementsLeft - 1, victoryPoints: p.victoryPoints + 1 }
          })
          let result = nextState as GameState
          if (isOmensEnabled(result)) {
            result = consumeCostEffectAfterBuild(result, actualPlayerId as PlayerId, 'settlement')
            result = consumeFreeBuildEffect(result, actualPlayerId as PlayerId, 'settlement')
          }
          return result
        })
        if (!next) return g
        return appendGameLog(next, { type: 'build', message: `Player ${actualPlayerId} built a settlement` })
      })
      setBuildMode(null)
      setErrorMessage(null)
    }
    if (buildMode === 'city' && canBuildCity(game, vid, playerId)) {
      if (!currentPlayer || !canAffordWithCost(currentPlayer, cityCost)) {
        setErrorMessage('Insufficient resources. Need: ' + (currentPlayer ? getMissingResourcesWithCost(currentPlayer, cityCost).map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', ') : 'unknown'))
        return
      }
      trackEvent('build', 'gameplay', 'city', 1)
      setGame(g => {
        const next = updateGameState(g, (state) => {
          const nextState: GameState = {
            ...state,
            vertices: { ...state.vertices },
          }
          const v = nextState.vertices[vid]
          if (v?.structure) {
            nextState.vertices[vid] = { ...v, structure: { player: playerId, type: 'city' } }
            nextState.players = state.players.map((p, i) => {
              if (i !== playerId - 1) return p
              const res = { ...p.resources }
              for (const [t, n] of Object.entries(cityCost)) { if (n != null && n > 0) res[t as keyof typeof res] = Math.max(0, (res[t as keyof typeof res] || 0) - n) }
              return { ...p, resources: res, settlementsLeft: p.settlementsLeft + 1, citiesLeft: p.citiesLeft - 1, victoryPoints: p.victoryPoints + 1 }
            })
          }
          return nextState
        })
        if (!next) return g
        let result = next
        if (isOmensEnabled(result)) result = consumeFreeBuildEffect(result, actualPlayerId as PlayerId, 'city')
        return appendGameLog(result, { type: 'build', message: `Player ${playerId} built a city` })
      })
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
        return appendGameLog(next, { type: 'setup', message: `Player ${actualPlayerId} placed road (setup)` })
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
        if (!result) return g
        return appendGameLog(result, { type: 'build', message: `Player ${actualPlayerId} built a road` })
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
    setGame(g => {
      const next = updateGameState(g, (state) => {
        let nextState: GameState = {
          ...state,
          lastDice: [dice1, dice2] as [number, number],
          players: state.players.map(p => ({ ...p, resources: { ...p.resources } })),
          lastResourceFlash: null,
        }
        if (sum === 7) {
          setBuildMode(null)
          setRobberMode({ moving: true, newHexId: null, playersToRob: new Set() })
          nextState.lastResourceHexIds = []
        } else {
          nextState.lastResourceFlash = distributeResources(nextState, sum) || null
          nextState.lastResourceHexIds = getHexIdsThatProducedResources(nextState, sum)
          // Oregon's Omens: must run after every roll. Applies Dysentery (no Wheat), Drought, Famine, etc.,
          // and ticks rollsRemaining so roll-based effects expire. Do not remove.
          if (isOmensEnabled(nextState)) {
            nextState = applyProductionModifiersAfterRoll(nextState, sum)
          }
        }
        return nextState
      })
      if (!next) return g
      let result = appendGameLog(next, {
        type: 'dice',
        message: `Player ${next.currentPlayerIndex + 1} rolled ${dice1} + ${dice2} = ${sum}`,
      })
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
      return result
    })
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
      setBuildMode(null)
      setGame(g => {
        const next = updateGameState(g, (state) => ({ ...state, robberHexId: hexId }))
        if (!next) return g
        return appendGameLog(next, { type: 'robbery', message: `Player ${actualPlayerId} moved the robber` })
      })
      setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
      setErrorMessage(null)
    }
  }

  const handleSelectPlayerToRob = (targetPlayerId: number) => {
    if (!robberMode.newHexId) return

    const stolen = stealResource(game, actualPlayerId, targetPlayerId) as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | null
    setGame(g => {
      const next = updateGameState(g, (state) => ({
        ...state,
        robberHexId: robberMode.newHexId!,
        lastRobbery: stolen
          ? { robbingPlayerId: actualPlayerId as PlayerId, targetPlayerId: targetPlayerId as PlayerId, resource: stolen }
          : null,
      }))
      if (!next) return g
      const resourceLabel = stolen ? TERRAIN_LABELS[stolen] : ''
      const msg = stolen
        ? `Player ${actualPlayerId} stole ${resourceLabel} from Player ${targetPlayerId}`
        : `Player ${actualPlayerId} moved the robber (Player ${targetPlayerId} had nothing to steal)`
      return appendGameLog(next, { type: 'robbery', message: msg })
    })
    setBuildMode(null)
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
    setGame(g => {
      const next = updateGameState(g, (state) => {
        const nextIndex = (state.currentPlayerIndex + 1) % state.players.length
        let nextState: GameState = {
          ...state,
          currentPlayerIndex: nextIndex,
          lastDice: null,
          lastResourceFlash: null,
          lastResourceHexIds: null,
        }
        nextState = resetPlayerOmensFlagsForNewTurn(nextState, nextIndex)
        return nextState
      })
      if (!next) return g
      return appendGameLog(next, { type: 'turn', message: `Turn: Player ${next.currentPlayerIndex + 1}'s turn` })
    })
    setBuildMode(null)
    setTradeFormOpen(false)
    setRobberMode({ moving: false, newHexId: null, playersToRob: new Set() })
    setOmenRobberMode(null)
  }

  const handleDrawOmenCard = () => {
    if (!game || !canDrawOmenCard(game, actualPlayerId as PlayerId)) return
    setGame(g => {
      if (!g) return g
      const next = drawOmenCard(g, actualPlayerId as PlayerId)
      updateOmenHand(next)
      return next
    })
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
    // Defer closing the trade form to the next frame to avoid Chrome layout/compositor glitches when resources and form disappear in the same paint
    requestAnimationFrame(() => {
      setTradeFormOpen(false)
      setErrorMessage(null)
    })
  }

  const isPlaying = game.phase === 'playing' && !actualWinner

  return (
    <div className="game-page parchment-page" style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px', paddingTop: '8px' }}>
      <GameGuide />
      <h1 className="game-title" style={{ textAlign: 'center', marginBottom: '0.25rem', marginTop: 0, fontSize: '1.5rem' }}>Settlers of Oregon</h1>
      <p className="game-subtitle" style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 0, marginBottom: '0.5rem' }}>
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
            {game.lastOmenDebuffDrawn && game.lastOmenDebuffDrawn.playerId === 1 && (
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
                <button onClick={() => setGame(g => g ? { ...g, lastOmenDebuffDrawn: null } : g)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss">×</button>
              </div>
            )}
            {game.lastOmenBuffPlayed && game.lastOmenBuffPlayed.playerId === 1 && (
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
                <button onClick={() => setGame(g => g ? { ...g, lastOmenBuffPlayed: null } : g)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss">×</button>
              </div>
            )}
            {game.lastPantryNegation && game.lastPantryNegation.playerId === 1 && (
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
                <button onClick={() => setGame(g => g ? { ...g, lastPantryNegation: null } : g)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss">×</button>
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
                        const viewerId = 1 as PlayerId
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
          </div>
        </div>

        <div className="game-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div
          className="game-board"
          style={{
            flex: '1 1 auto',
            minWidth: 600,
            borderRadius: 12,
            overflow: 'visible',
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
            />
          )}
        </div>

        <aside className="game-sidebar" style={{ flex: '0 0 280px', background: 'var(--surface)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actualWinner && (
            <button
              onClick={() => {
                trackEvent('new_game', 'gameplay', 'single_player')
                gameWonTrackedRef.current = false
                setGame(createInitialState(2))
                setBuildMode(null)
              }}
              style={{ 
                padding: '10px 20px', 
                background: 'var(--accent)', 
                border: 'none', 
                borderRadius: 8, 
                color: '#fff', 
                fontWeight: 'bold', 
                cursor: 'pointer',
                marginBottom: 8,
                width: '100%'
              }}
            >
              New game
            </button>
          )}
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
                ? (cardId: string, targets?: PlayOmenTargets) => {
                    if (cardId === 'robbers_regret') setOmenRobberMode({ cardId: 'robbers_regret', step: 'hex' })
                    else setGame(playOmenCard(game, actualPlayerId as PlayerId, cardId, targets))
                  }
                : undefined
            }
            getOmenCardName={getOmenCardName}
            getOmenCardEffectText={getOmenCardEffectText}
            activeOmensEffects={isOmensEnabled(game) ? getActiveEffectsForPlayer(game, actualPlayerId as PlayerId) : []}
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
              isOmensEnabled(game) && isPlaying && !isAITurn
                ? (() => {
                    const seen = new Map<string, string>()
                    for (const v of Object.values(game.vertices)) {
                      if (v.structure?.player !== actualPlayerId || !v.hexIds?.length) continue
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
              isOmensEnabled(game) && isPlaying && !isAITurn
                ? (() => {
                    const { myHexIds } = getHexesForFarmSwap(game, actualPlayerId as PlayerId)
                    return myHexIds.map(hexId => {
                      const h = game.hexes.find(x => x.id === hexId)
                      return { hexId, label: h ? `${TERRAIN_LABELS[h.terrain]} (${h.number})` : hexId }
                    })
                  })()
                : undefined
            }
            farmSwapTargetHexOptions={
              isOmensEnabled(game) && isPlaying && !isAITurn
                ? (() => {
                    const { targetHexIds } = getHexesForFarmSwap(game, actualPlayerId as PlayerId)
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

        </aside>
        </div>
      </div>
    </div>
  )
}
