import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HexBoard } from '../components/HexBoard'
import { ZoomableBoard } from '../components/ZoomableBoard'
import { PlayerResources } from '../components/PlayerResources'
import { VictoryPointTracker } from '../components/VictoryPointTracker'
import { GameGuide } from '../components/GameGuide'
import { DiceRollAnimation } from '../components/DiceRollAnimation'
import { GameHistory } from '../components/GameHistory'
import { ColorSelection } from '../components/ColorSelection'
import { MultiplayerLobby } from '../components/MultiplayerLobby'
import {
  createInitialState,
  appendGameLog,
  getSetupOrderSequence,
  getNextPlayerIndex,
  getFirstPlayerIndex,
  applyRollOrderRoll,
} from '../game/state'
import { runAISetup, runAITurn, runAITrade, runAIRobberMove, runAISelectPlayerToRob, runAIDrawOmen, runAIPlayOmen, evaluateTradeOffer } from '../game/ai'
import { getTradeChatMessage } from '../game/tradeLogFlavor'
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
import { SETTLERS_PATH } from '../config/games'

const SETTLERS_LOBBY_PATH = `${SETTLERS_PATH}/lobby`

const SINGLE_PLAYER_STORAGE_KEY = 'settlers-sp-game'

function getSetupPlayerIndex(state: GameState): number {
  const sequence = getSetupOrderSequence(state)
  return sequence[Math.min(state.setupPlacements, sequence.length - 1)] ?? 0
}

// Helper to ensure GameState is properly typed when updating
function updateGameState(g: GameState | null, updater: (state: GameState) => GameState): GameState | null {
  if (!g) return g
  return updater(g)
}

type StartScreen = 'mode' | 'ai-count' | 'colors' | 'multiplayer' | 'game'

export function SettlersGamePage() {
  const navigate = useNavigate()
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
  const [tableTradeState, setTableTradeState] = useState<'idle' | 'considering' | 'resolved'>('idle')
  const [tableTradeResolution, setTableTradeResolution] = useState<{
    acceptedAIs: PlayerId[]
    rejected: { playerId: PlayerId; message: string }[]
    give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'
    get: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'
  } | null>(null)
  const [robberMode, setRobberMode] = useState<{ moving: boolean; newHexId: string | null; playersToRob: Set<number> }>({ moving: false, newHexId: null, playersToRob: new Set() })
  const [omenRobberMode, setOmenRobberMode] = useState<{ cardId: string; step: 'hex' | 'player'; hexId?: string; playersOnHex?: Set<number> } | null>(null)
  const [diceRolling, setDiceRolling] = useState<{ dice1: number; dice2: number } | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'resources' | 'log'>('resources')
  const [pendingRestoreGame, setPendingRestoreGame] = useState<GameState | null>(null)
  const [dismissedInstruction, setDismissedInstruction] = useState<string | null>(null)
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

  // Force light parchment theme when showing mode, AI count, or color picker so color/text are never inherited from dark theme
  useEffect(() => {
    const active = startScreen === 'mode' || startScreen === 'ai-count' || startScreen === 'colors'
    document.body.classList.toggle('mode-select-view', active)
    return () => document.body.classList.remove('mode-select-view')
  }, [startScreen])

  // Prevent pull-to-refresh on mobile when in an active single-player game (avoids accidental reload)
  useEffect(() => {
    document.body.classList.toggle('settlers-game-active', game != null)
    return () => document.body.classList.remove('settlers-game-active')
  }, [game])

  // Check for saved single-player game on mount; show resume prompt instead of auto-restoring
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SINGLE_PLAYER_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as GameState
      if (!parsed?.players?.length || !parsed?.hexes?.length) return
      const hasWinner = parsed.players.some((p: { victoryPoints?: number }) => (p.victoryPoints ?? 0) >= 10)
      if (hasWinner) return
      setPendingRestoreGame(parsed)
    } catch {
      /* ignore corrupted or invalid saved state */
    }
  }, [])

  // Persist single-player game so refresh or accidental reload doesn't lose progress
  useEffect(() => {
    if (!game) return
    const hasWinner = game.players.some(p => p.victoryPoints >= 10)
    try {
      if (hasWinner) {
        localStorage.removeItem(SINGLE_PLAYER_STORAGE_KEY)
      } else {
        localStorage.setItem(SINGLE_PLAYER_STORAGE_KEY, JSON.stringify(game))
      }
    } catch {
      /* ignore quota or storage errors */
    }
  }, [game])

  const handleColorsSelected = (colors: string[], options?: { oregonsOmens?: boolean }) => {
    setSelectedColors(colors)
    setGame(createInitialState(numPlayers, colors, { oregonsOmens: options?.oregonsOmens }))
    trackEvent('game_started', 'gameplay', 'single_player', numPlayers)
    setStartScreen('game')
  }

  // All hooks must be called before any early returns to avoid React hooks violations
  // Calculate derived values safely (will be recalculated when game is set)
  const n = game?.players.length ?? 0
  const rollOrderRollerIndex =
    game?.phase === 'roll_order'
      ? (game.orderTiebreak != null ? (game.orderTiebreak[game.orderTiebreakRollIndex ?? 0] ?? 0) : (game.orderRollIndex ?? 0))
      : 0
  const setupPlayerIndex = game ? getSetupPlayerIndex(game) : 0
  const currentPlayer =
    game?.phase === 'roll_order'
      ? game?.players[rollOrderRollerIndex]
      : game?.players[game?.phase === 'setup' ? setupPlayerIndex : game.currentPlayerIndex]
  const playerId = currentPlayer?.id ?? 1
  const winner = game?.players.find(p => p.victoryPoints >= 10)

  const setupPendingVertexId = game?.setupPendingVertexId ?? null

  // Roll for order: AI rolls when it's AI's turn
  useEffect(() => {
    if (!game || game.phase !== 'roll_order' || rollOrderRollerIndex === 0) return
    const t = setTimeout(() => {
      const a = 1 + Math.floor(Math.random() * 6)
      const b = 1 + Math.floor(Math.random() * 6)
      const sum = a + b
      const next = applyRollOrderRoll(game, rollOrderRollerIndex, sum)
      const withLog = appendGameLog(next, { type: 'roll_order', message: `Player ${rollOrderRollerIndex + 1} rolled ${a} + ${b} = ${sum} for turn order` })
      setGame({ ...withLog, lastDice: [a, b] as [number, number] })
    }, 600)
    return () => clearTimeout(t)
  }, [game?.phase, game?.orderRollIndex, game?.orderTiebreakRollIndex, rollOrderRollerIndex])

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
        setGame(g => {
          if (!g) return g
          const idx = g.currentPlayerIndex
          const p = g.players[idx]
          if (!p || (p.resources[trade.give] ?? 0) < 4) return g
          const baseRate = getTradeRate(g, aiPlayerId, trade.give)
          const { rate: tradeRate, stateAfterTrade } = isOmensEnabled(g)
            ? getEffectiveTradeRate(g, aiPlayerId, trade.give, baseRate)
            : { rate: baseRate, stateAfterTrade: undefined }
          if ((p.resources[trade.give] ?? 0) < tradeRate) return g
          let next: GameState = {
            ...g,
            players: g.players.map((pl, i) => {
              if (i !== idx) return pl
              const res = { ...pl.resources }
              res[trade.give] = Math.max(0, (res[trade.give] ?? 0) - tradeRate)
              res[trade.get] = (res[trade.get] ?? 0) + 1
              return { ...pl, resources: res }
            }),
          }
          if (stateAfterTrade) next = { ...stateAfterTrade, players: next.players }
          const playerName = next.players[aiPlayerId - 1]?.name ?? 'Player 2'
          return appendGameLog(next, { type: 'resources', message: `${playerName}: ${trade.reason}` })
        })
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
                type="button"
                className={`mode-btn ${count === 1 ? 'mode-btn-cta' : 'mode-btn-sage'}`}
                onClick={() => {
                  trackEvent('play_vs_ai_clicked', 'navigation', 'ai_count', count)
                  setNumPlayers((count + 1) as 2 | 3 | 4)
                  setStartScreen('colors')
                }}
                style={{
                  padding: '16px 32px',
                  fontSize: 18,
                  fontWeight: 'bold',
                  background: count === 1 ? 'var(--cta, #C17D5B)' : 'var(--accent-sage, #8BAE9B)',
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
      <>
        {pendingRestoreGame && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              background: 'rgba(0,0,0,0.4)',
            }}
            onClick={() => setPendingRestoreGame(null)}
          >
            <div
              className="paper-section"
              role="dialog"
              aria-labelledby="resume-game-title"
              style={{
                background: '#FFFBF0',
                color: '#2A1A0A',
                borderRadius: 12,
                padding: 24,
                maxWidth: 360,
                width: '100%',
                boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                border: '1px solid rgba(42,26,10,0.2)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <h2 id="resume-game-title" style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700 }}>
                Resume game?
              </h2>
              <p style={{ margin: '0 0 20px', fontSize: 15, color: 'rgba(42,26,10,0.9)', lineHeight: 1.4 }}>
                You have a single-player game in progress. Resume where you left off or start a new game.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setGame(pendingRestoreGame)
                    setStartScreen('game')
                    setNumPlayers(pendingRestoreGame.players.length as 2 | 3 | 4)
                    setPendingRestoreGame(null)
                  }}
                  style={{
                    padding: '12px 20px',
                    fontSize: 15,
                    fontWeight: 600,
                    background: '#C17D5B',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  }}
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try { localStorage.removeItem(SINGLE_PLAYER_STORAGE_KEY) } catch { /* ignore */ }
                    setPendingRestoreGame(null)
                  }}
                  style={{
                    padding: '12px 20px',
                    fontSize: 15,
                    fontWeight: 600,
                    background: '#E8E0D5',
                    color: '#2A1A0A',
                    border: '1px solid rgba(42,26,10,0.3)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Start new game
                </button>
              </div>
            </div>
          </div>
        )}
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
            background: 'var(--parchment-bg, #F6EEE3)',
            color: 'var(--ink, #2A1A0A)',
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
                type="button"
                className="mode-btn mode-btn-cta mode-btn-cta-pulse"
                onClick={() => {
                  trackEvent('play_vs_ai_clicked', 'navigation', 'mode_select')
                  setStartScreen('ai-count')
                }}
                style={{
                  padding: '16px 32px',
                  fontSize: 18,
                  fontWeight: 'bold',
                  background: 'var(--cta, #C17D5B)',
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
                type="button"
                className="mode-btn mode-btn-sage"
                onClick={() => {
                  trackEvent('multiplayer_clicked', 'navigation', 'mode_select')
                  navigate(SETTLERS_LOBBY_PATH)
                }}
                style={{
                  padding: '16px 32px',
                  fontSize: 18,
                  fontWeight: 'bold',
                  background: 'var(--accent-sage, #8BAE9B)',
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
            <p style={{ marginTop: 16, marginBottom: 0, fontSize: 14, color: 'var(--ink)', opacity: 0.65 }}>
              <Link to="/games" style={{ color: 'var(--muted, #6b7280)', textDecoration: 'none', marginRight: 16 }}>Games</Link>
              <Link to="/how-to-play" style={{ color: 'var(--muted, #6b7280)', textDecoration: 'none', marginRight: 16 }}>How to play</Link>
              <Link to="/about" style={{ color: 'var(--muted, #6b7280)', textDecoration: 'none', marginRight: 16 }}>About</Link>
              <Link to="/faq" style={{ color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>FAQ</Link>
            </p>
          </main>
        </div>
      </>
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

  const handleRollOrder = () => {
    if (game.phase !== 'roll_order' || rollOrderRollerIndex !== 0) return
    const dice1 = 1 + Math.floor(Math.random() * 6)
    const dice2 = 1 + Math.floor(Math.random() * 6)
    const sum = dice1 + dice2
    const next = applyRollOrderRoll(game, 0, sum)
    const withLog = appendGameLog(next, { type: 'roll_order', message: `Player 1 rolled ${dice1} + ${dice2} = ${sum} for turn order` })
    setGame({ ...withLog, lastDice: [dice1, dice2] as [number, number] })
  }

  if (game.phase === 'roll_order') {
    const rolls = game.orderTiebreak != null ? (game.orderTiebreakRolls ?? []) : (game.orderRolls ?? [])
    const displayOrder = game.orderTiebreak ?? Array.from({ length: n }, (_, i) => i)
    return (
      <div className="game-page parchment-page" style={{ minHeight: '100vh', padding: 24, background: 'var(--parchment-bg)' }}>
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
          {rollOrderRollerIndex === 0 ? (
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
              Waiting for {currentPlayer?.name ?? `Player ${rollOrderRollerIndex + 1}`} to roll…
            </p>
          )}
        </div>
      </div>
    )
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
        if (next.setupPlacements >= 2 * n) {
          next.phase = 'playing'
          next.currentPlayerIndex = getFirstPlayerIndex(next)
        }
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
    requestAnimationFrame(() => {
      setTradeFormOpen(false)
      setErrorMessage(null)
    })
  }

  const handleOfferToTable = (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', get: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => {
    if (!game || tableTradeState === 'considering') return
    if (give === get) {
      setErrorMessage('Give and Get must be different resources.')
      return
    }
    const human = game.players[0]
    if (!human || (human.resources[give] || 0) < 1) {
      setErrorMessage(`You need at least 1 ${give} to offer.`)
      return
    }
    const aiOpponents = game.players.filter(p => p.id !== 1) as { id: PlayerId }[]
    if (aiOpponents.length === 0) return

    setTableTradeState('considering')
    setTableTradeResolution(null)
    setErrorMessage(null)

    const delayMs = 800 + Math.floor(Math.random() * 700)
    setTimeout(() => {
      const persona = game.aiPersona ?? 'merchant'
      const acceptedAIs: PlayerId[] = []
      const rejected: { playerId: PlayerId; message: string }[] = []

      for (const ai of aiOpponents) {
        const aiId = ai.id as PlayerId
        const decision = evaluateTradeOffer(game, aiId, 1 as PlayerId, give, 1, get, 1)
        const { speaker, message } = decision.code
          ? getTradeChatMessage(decision.code, persona, decision.resource)
          : { speaker: ai.id === 2 ? 'Player 2' : `Player ${ai.id}`, message: decision.reason }

        if (decision.accepted) {
          acceptedAIs.push(aiId)
        } else {
          const logMessage = decision.code === 'REJECT_NO_MATCH' ? 'No thanks.' : message
          rejected.push({ playerId: aiId, message: logMessage })
        }
      }

      setGame(g => {
        if (!g) return g
        let next = g
        for (const r of rejected) {
          const p = g.players[r.playerId - 1]
          next = appendGameLog(next, { type: 'chat', message: r.message, speaker: p?.name ?? `Player ${r.playerId}` })
        }
        return next
      })

      if (acceptedAIs.length === 0) {
        setTableTradeState('idle')
        setTableTradeResolution(null)
        setTradeFormOpen(false)
        return
      }

      if (acceptedAIs.length === 1) {
        const targetId = acceptedAIs[0]
        const targetPlayer = game.players[targetId - 1]
        const { message } = getTradeChatMessage('ACCEPT_TRADE', persona)
        const speaker = targetPlayer?.name ?? `Player ${targetId}`

        setGame(g => {
          if (!g) return g
          let next = appendGameLog(g, { type: 'chat', message, speaker })
          next = {
            ...next,
            players: next.players.map((pl) => {
              if (pl.id === 1) {
                const res = { ...pl.resources }
                res[give] = Math.max(0, (res[give] || 0) - 1)
                res[get] = (res[get] || 0) + 1
                return { ...pl, resources: res }
              }
              if (pl.id === targetId) {
                const res = { ...pl.resources }
                res[get] = Math.max(0, (res[get] || 0) - 1)
                res[give] = (res[give] || 0) + 1
                return { ...pl, resources: res }
              }
              return pl
            }),
          }
          return next
        })
        setTableTradeState('idle')
        setTableTradeResolution(null)
        setTradeFormOpen(false)
        return
      }

      setTableTradeState('resolved')
      setTableTradeResolution({ acceptedAIs, rejected, give, get })
    }, delayMs)
  }

  const handleFinalizeTableTrade = (targetAiPlayerId: number) => {
    if (!game || !tableTradeResolution || !tableTradeResolution.acceptedAIs.includes(targetAiPlayerId as PlayerId)) return
    const { give, get } = tableTradeResolution
    const targetPlayer = game.players[targetAiPlayerId - 1]
    const persona = game.aiPersona ?? 'merchant'
    const { message } = getTradeChatMessage('ACCEPT_TRADE', persona)
    const speaker = targetPlayer?.name ?? `Player ${targetAiPlayerId}`

    setGame(g => {
      if (!g) return g
      let next = appendGameLog(g, { type: 'chat', message, speaker })
      next = {
        ...next,
        players: next.players.map((pl) => {
          if (pl.id === 1) {
            const res = { ...pl.resources }
            res[give] = Math.max(0, (res[give] || 0) - 1)
            res[get] = (res[get] || 0) + 1
            return { ...pl, resources: res }
          }
          if (pl.id === targetAiPlayerId) {
            const res = { ...pl.resources }
            res[get] = Math.max(0, (res[get] || 0) - 1)
            res[give] = (res[give] || 0) + 1
            return { ...pl, resources: res }
          }
          return pl
        }),
      }
      return next
    })
    setTableTradeState('idle')
    setTableTradeResolution(null)
    setTradeFormOpen(false)
  }

  const isPlaying = game.phase === 'playing' && !actualWinner

  const currentInstruction =
    game.phase === 'setup' && !isSetupRoad ? 'Place a settlement' :
    game.phase === 'setup' && isSetupRoad ? 'Place a road next to it' :
    isPlaying && robberMode.moving && !omenRobberMode ? 'Rolled 7! Click a hex to move the robber' :
    isPlaying && robberMode.newHexId && robberMode.playersToRob.size > 0 ? 'Select a player to rob' :
    isPlaying && omenRobberMode?.step === 'hex' ? "Robber's Regret: click a hex to move the robber" :
    isPlaying && omenRobberMode?.step === 'player' ? "Robber's Regret: select a player to rob (or skip)" :
    isPlaying && !robberMode.moving && !robberMode.newHexId && !omenRobberMode ? 'Roll dice, then build or end turn' :
    winner ? `${winner.name} wins with ${winner.victoryPoints} VP!` : null

  const showInstruction = currentInstruction != null && currentInstruction !== dismissedInstruction

  // Consolidated header banner: events (robbery, omen, error) take priority over instruction
  const bannerEvent = (game.lastOmenDebuffDrawn && game.lastOmenDebuffDrawn.playerId === 1)
    ? (() => {
        const d = game.lastOmenDebuffDrawn!
        const counts: Record<string, number> = {}
        for (const t of d.lostResources ?? []) { counts[t] = (counts[t] ?? 0) + 1 }
        const lostStr = Object.keys(counts).length ? ` You lost: ${Object.entries(counts).map(([t, n]) => n === 1 ? TERRAIN_LABELS[t as keyof typeof TERRAIN_LABELS] : `${n} ${TERRAIN_LABELS[t as keyof typeof TERRAIN_LABELS]}`).join(', ')}` : ''
        return { text: `You drew a debuff: ${getOmenCardName(d.cardId)} — ${getOmenCardEffectText(d.cardId)}${lostStr}`, style: { background: 'rgba(254, 226, 226, 1)', border: '1px solid rgba(185, 28, 28, 0.6)', color: '#7f1d1d' }, onDismiss: () => setGame(g => g ? { ...g, lastOmenDebuffDrawn: null } : g) }
      })()
    : (game.lastOmenBuffPlayed && game.lastOmenBuffPlayed.playerId === 1)
    ? (() => {
        const b = game.lastOmenBuffPlayed!
        const counts: Record<string, number> = {}
        for (const t of b.resourcesGained) { counts[t] = (counts[t] ?? 0) + 1 }
        const list = Object.entries(counts).map(([t, n]) => n === 1 ? TERRAIN_LABELS[t as keyof typeof TERRAIN_LABELS] : `${n} ${TERRAIN_LABELS[t as keyof typeof TERRAIN_LABELS]}`).join(', ')
        return { text: `${getOmenCardName(b.cardId)}: you collected ${list}`, style: { background: 'rgba(220, 252, 231, 1)', border: '1px solid rgba(22, 163, 74, 0.6)', color: '#14532d' }, onDismiss: () => setGame(g => g ? { ...g, lastOmenBuffPlayed: null } : g) }
      })()
    : (game.lastPantryNegation && game.lastPantryNegation.playerId === 1)
    ? { text: `Well-Stocked Pantry negated ${getOmenCardName(game.lastPantryNegation.negatedCardId)} — no resources lost.`, style: { background: 'rgba(220, 252, 231, 1)', border: '1px solid rgba(22, 163, 74, 0.6)', color: '#14532d' }, onDismiss: () => setGame(g => g ? { ...g, lastPantryNegation: null } : g) }
    : (game.lastRobbery || errorMessage)
    ? (() => {
        const r = game.lastRobbery
        const viewerId = 1 as PlayerId
        const isRobber = r && r.robbingPlayerId === viewerId
        const isVictim = r && r.targetPlayerId === viewerId
        const resourceLabel = r?.resource ? TERRAIN_LABELS[r.resource] : ''
        const text = r
          ? (isRobber ? `You stole ${resourceLabel}` : isVictim ? `${game.players[r.robbingPlayerId - 1]?.name || `Player ${r.robbingPlayerId}`} stole your ${resourceLabel}` : `${game.players[r.robbingPlayerId - 1]?.name || `Player ${r.robbingPlayerId}`} stole ${resourceLabel} from ${game.players[r.targetPlayerId - 1]?.name || `Player ${r.targetPlayerId}`}`)
          : (errorMessage ?? '')
        const style = r
          ? (isRobber ? { background: 'rgba(220, 252, 231, 1)', border: '1px solid rgba(22, 163, 74, 0.6)', color: '#14532d' } as const
            : isVictim ? { background: 'rgba(254, 226, 226, 1)', border: '1px solid rgba(185, 28, 28, 0.6)', color: '#7f1d1d' } as const
            : { background: '#FFFBF0', border: '1px solid rgba(42,26,10,0.2)', color: '#2A1A0A' } as const)
          : { background: 'rgba(254, 226, 226, 1)', border: '1px solid rgba(185, 28, 28, 0.6)', color: '#7f1d1d' } as const
        return { text, style, onDismiss: () => { setErrorMessage(null); setGame(g => g ? { ...g, lastRobbery: null } : g) } }
      })()
    : showInstruction && currentInstruction
    ? { text: currentInstruction, style: { background: '#FFFBF0', border: '1px solid rgba(42,26,10,0.2)', color: '#2A1A0A' }, onDismiss: () => setDismissedInstruction(currentInstruction) }
    : null

  return (
    <div className="game-page parchment-page game-page--full-width" style={{ width: '100%', margin: 0, padding: '8px 16px 0', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Game title (left) and consolidated banner (centered in header) */}
      <header style={{ flexShrink: 0, padding: '0 16px 12px', borderBottom: '1px solid rgba(42,26,10,0.12)', display: 'flex', alignItems: 'center', position: 'relative' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink, #2A1A0A)', flexShrink: 0 }}>Settlers of Oregon</h1>
        {bannerEvent && (
          <div
            role={bannerEvent.text.includes('stole') || bannerEvent.text.includes('debuff') ? 'alert' : 'status'}
            aria-live="polite"
            className="game-toast-enter game-instruction-modal"
            style={{
              position: 'fixed',
              left: '50vw',
              transform: 'translateX(-50%)',
              top: 14,
              zIndex: 1001,
              maxWidth: 420,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '10px 16px',
              borderRadius: 10,
              ...bannerEvent.style,
              fontSize: 14,
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            <span style={{ flex: 1, minWidth: 0, textAlign: 'center', wordWrap: 'break-word', overflowWrap: 'break-word' }}>
              {bannerEvent.text}
            </span>
            <button
              type="button"
              onClick={bannerEvent.onDismiss}
              aria-label="Dismiss"
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                minWidth: 32,
                minHeight: 32,
                padding: 0,
                border: 'none',
                borderRadius: 8,
                background: 'rgba(42,26,10,0.12)',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: 18,
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
      </header>

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

      <div className="game-layout-wrapper" style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="game-layout" style={{ display: 'flex', gap: 24, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
        <ZoomableBoard
          className="game-board"
          style={{
            flex: '1 1 0',
            minWidth: 0,
            minHeight: 400,
            borderRadius: 12,
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
        </ZoomableBoard>

        <aside className="game-sidebar" style={{ position: 'relative', flex: '0 0 280px', minHeight: 0, background: 'var(--surface)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actualWinner && (
            <button
              onClick={() => {
                trackEvent('new_game', 'gameplay', 'single_player')
                gameWonTrackedRef.current = false
                setGame(createInitialState(2))
                setBuildMode(null)
                setTradeFormOpen(false)
                setTableTradeState('idle')
                setTableTradeResolution(null)
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
                width: '100%',
                flexShrink: 0,
              }}
            >
              New game
            </button>
          )}
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
              className={`game-sidebar-tab ${sidebarTab === 'log' ? 'game-sidebar-tab--active' : ''}`}
              onClick={() => setSidebarTab('log')}
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
            onRollDice={isPlaying && !isAITurn ? handleRoll : undefined}
            onEndTurn={isPlaying && !isAITurn ? handleEndTurn : undefined}
            robberMode={robberMode}
            onSelectPlayerToRob={handleSelectPlayerToRob}
            buildMode={buildMode}
            onSetBuildMode={setBuildMode}
            tradeFormOpen={tradeFormOpen}
            onSetTradeFormOpen={(open) => {
              setTradeFormOpen(open)
              if (!open) {
                setTableTradeState('idle')
                setTableTradeResolution(null)
              }
            }}
            tradeGive={tradeGive}
            onSetTradeGive={setTradeGive}
            tradeGet={tradeGet}
            onSetTradeGet={setTradeGet}
            onTrade={handleTrade}
            onSetErrorMessage={setErrorMessage}
            onOfferToTable={isPlaying && !isAITurn && game.players.length >= 2 ? handleOfferToTable : undefined}
            tableTradeState={tableTradeState}
            tableTradeResolution={tableTradeResolution}
            onFinalizeTableTrade={handleFinalizeTableTrade}
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
                ? (game.players.find(p => p.id === actualPlayerId)?.omenCardsPurchased ?? 0)
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
                      const playersOnHex = getPlayersOnHex(game, hexId)
                      const ownerIds = Array.from(playersOnHex).filter(pid => pid !== actualPlayerId)
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
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <GameHistory gameLog={game.gameLog ?? []} fillHeight />
            </div>
          )}

          {game.phase === 'setup' && (
            <p style={{ fontSize: 14, color: 'var(--text)', padding: '8px 10px', borderRadius: 8, background: 'rgba(44,26,10,0.08)', border: '1px solid rgba(44,26,10,0.15)' }}>
              {isAITurn ? `${actualCurrentPlayer?.name ?? 'AI'} is placing…` : !isSetupRoad ? 'Click an empty spot to place a settlement.' : 'Click an edge connected to your settlement to place a road.'}
            </p>
          )}

          {isPlaying && isAITurn && (
            <p style={{ fontSize: 14, color: 'var(--text)', padding: '8px 10px', borderRadius: 8, background: 'rgba(44,26,10,0.08)', border: '1px solid rgba(44,26,10,0.15)' }}>
              {game.lastDice ? `${actualCurrentPlayer?.name ?? 'AI'} rolled ${game.lastDice[0]} + ${game.lastDice[1]} = ${game.lastDice[0] + game.lastDice[1]}` : `${actualCurrentPlayer?.name ?? 'AI'} is thinking…`}
            </p>
          )}

          </div>
          {/* Game Guide at bottom of panel - accessible, no SEO impact (content in modal + How to Play page) */}
          <div style={{ flexShrink: 0, marginTop: 'auto', paddingTop: 12, paddingBottom: 'max(8px, env(safe-area-inset-bottom))', borderTop: '1px solid rgba(42,26,10,0.12)' }}>
            <GameGuide variant="inline" />
          </div>
        </aside>
        </div>
      </div>
    </div>
  )
}
