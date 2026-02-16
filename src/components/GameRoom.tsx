import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { settlersGameRoomUrl, SETTLERS_PATH } from '../config/games'
import { createInitialState } from '../game/state'
import { MultiplayerGame } from './MultiplayerGame'
import { trackEvent } from '../utils/analytics'
import type { GameState } from '../game/types'

const STORAGE_KEY = (gameId: string) => `supabase_game_${gameId}`
const HOST_KEY = (gameId: string) => `supabase_host_${gameId}`

function getInitialPlayerIndex(gameId: string): number | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('host') === '1') return 0
  if (sessionStorage.getItem(HOST_KEY(gameId))) return 0
  try {
    const raw = localStorage.getItem(STORAGE_KEY(gameId))
    if (!raw) return null
    const data = JSON.parse(raw) as { playerIndex: number }
    return typeof data.playerIndex === 'number' ? data.playerIndex : null
  } catch {
    return null
  }
}

type GameRow = {
  id: string
  num_players: number
  phase: 'lobby' | 'setup' | 'playing' | 'ended'
  state: GameState | null
  oregons_omens?: boolean
  created_at: string
  updated_at: string
}

type GamePlayerRow = {
  id: string
  game_id: string
  player_index: number
  nickname: string | null
  joined_at: string
}

const defaultColors = ['teal', 'green', 'pink', 'purple'] as const

export function GameRoom({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<GameRow | null>(null)
  const [players, setPlayers] = useState<GamePlayerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [myPlayerIndex, setMyPlayerIndex] = useState<number | null>(() => getInitialPlayerIndex(gameId))
  const [joining, setJoining] = useState(false)
  const [starting, setStarting] = useState(false)
  const [joinNickname, setJoinNickname] = useState('')

  // SEO: set document title for multiplayer /game/:id route
  useEffect(() => {
    const prev = document.title
    document.title = game?.phase === 'lobby' ? 'Settlers of Oregon – Game Lobby' : 'Settlers of Oregon – Game'
    return () => { document.title = prev }
  }, [game?.phase])

  const fetchGame = async () => {
    const { data, error: e } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()
    if (e) {
      setError(e.message)
      setGame(null)
      return
    }
    setGame(data as GameRow)
    setError(null)
  }

  const fetchPlayers = async () => {
    const { data, error: e } = await supabase
      .from('game_players')
      .select('*')
      .eq('game_id', gameId)
      .order('player_index')
    if (e) return
    setPlayers((data as GamePlayerRow[]) ?? [])
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      await fetchGame()
      if (!cancelled) await fetchPlayers()
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [gameId])

  // When URL has ?host=1, mark this tab as host (sessionStorage) and clean URL so share link stays clean
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('host') !== '1') return
    sessionStorage.setItem(HOST_KEY(gameId), '1')
    localStorage.setItem(STORAGE_KEY(gameId), JSON.stringify({ playerIndex: 0 }))
    const url = new URL(window.location.href)
    url.searchParams.delete('host')
    const clean = url.pathname + (url.search || '') + url.hash
    window.history.replaceState(null, '', clean)
  }, [gameId])

  // In lobby: if we have 2+ players and we think we're Player 1 but this tab has no host sessionStorage, we're likely a second tab that stole localStorage — clear so we show "Join as: Player 2". Never clear when only 1 player (that single player is the host, even in a new tab).
  const twoPlayersAndWeClaimZero = players.length >= 2 && myPlayerIndex === 0
  useEffect(() => {
    if (!game || game.phase !== 'lobby' || !twoPlayersAndWeClaimZero) return
    if (typeof window !== 'undefined' && sessionStorage.getItem(HOST_KEY(gameId))) return
    setMyPlayerIndex(null)
    localStorage.removeItem(STORAGE_KEY(gameId))
  }, [game?.phase, gameId, twoPlayersAndWeClaimZero])

  // Realtime: when another player joins (or game starts), refresh so host sees updates
  useEffect(() => {
    const channel = supabase
      .channel(`lobby:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          fetchPlayers()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        () => {
          fetchGame()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  // Polling fallback: refresh player list every 3s while in lobby (in case Realtime isn't enabled)
  useEffect(() => {
    if (!game || game.phase !== 'lobby') return
    const interval = setInterval(() => {
      fetchPlayers()
      fetchGame()
    }, 3000)
    return () => clearInterval(interval)
  }, [gameId, game?.phase])

  const joinSeat = async (playerIndex: number) => {
    setJoining(true)
    const { error: e } = await supabase.from('game_players').insert({
      game_id: gameId,
      player_index: playerIndex,
      nickname: joinNickname.trim() || `Player ${playerIndex + 1}`,
    })
    setJoining(false)
    if (e) {
      setError(e.message)
      return
    }
    localStorage.setItem(STORAGE_KEY(gameId), JSON.stringify({ playerIndex }))
    setMyPlayerIndex(playerIndex)
    trackEvent('multiplayer_player_joined', 'multiplayer', `seat_${playerIndex}`)
    await fetchPlayers()
  }

  const startGame = async () => {
    if (!game || game.phase !== 'lobby' || players.length < 2) return
    setStarting(true)
    const numPlayers = game.num_players as 2 | 3 | 4
    const colors = defaultColors.slice(0, numPlayers)
    const state = createInitialState(numPlayers, [...colors], { multiplayer: true, oregonsOmens: game.oregons_omens ?? false })
    const { error: e } = await supabase
      .from('games')
      .update({
        phase: 'setup',
        state,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
    setStarting(false)
    if (e) {
      setError(e.message)
      return
    }
    trackEvent('game_started', 'multiplayer', `players_${numPlayers}`)
    await fetchGame()
  }

  const shareUrl = settlersGameRoomUrl(gameId)

  const copyLink = () => {
    trackEvent('multiplayer_link_copied', 'multiplayer', 'share_link')
    navigator.clipboard.writeText(shareUrl)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, rgb(26, 31, 46) 0%, rgb(45, 55, 72) 100%)', color: 'var(--text)' }}>
        Loading game…
      </div>
    )
  }

  if (error && !game) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, background: 'linear-gradient(180deg, rgb(26, 31, 46) 0%, rgb(45, 55, 72) 100%)', color: 'var(--text)' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Game not found</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>{error}</p>
        <a href={SETTLERS_PATH} style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Back to game</a>
      </div>
    )
  }

  if (!game) return null

  if (game.phase !== 'lobby' && game.state) {
    return (
      <MultiplayerGame
        gameId={gameId}
        myPlayerIndex={myPlayerIndex ?? -1}
        initialState={{ ...game.state, setupPendingVertexId: game.state.setupPendingVertexId ?? null }}
      />
    )
  }

  const takenSeats = new Set(players.map(p => p.player_index))
  const emptySeats = Array.from({ length: game.num_players }, (_, i) => i).filter(i => !takenSeats.has(i))
  const canStart = myPlayerIndex !== null && players.length >= 2

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
      <h1 style={{ margin: 0, fontSize: 28 }}>Game lobby</h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>Share link:</span>
        <code style={{ background: 'var(--surface)', padding: '8px 12px', borderRadius: 8, fontSize: 14 }}>{shareUrl}</code>
        <button
          type="button"
          onClick={copyLink}
          style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
        >
          Copy
        </button>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, minWidth: 280 }}>
        {game.oregons_omens && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Oregon&apos;s Omens: Yes</div>}
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>Players ({players.length}/{game.num_players})</div>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {players.map(p => (
            <li key={p.id} style={{ marginBottom: 6 }}>
              {p.nickname || `Player ${p.player_index + 1}`}
              {myPlayerIndex === p.player_index && <span style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 12 }}>(you)</span>}
            </li>
          ))}
        </ul>
        {emptySeats.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <input
              type="text"
              placeholder="Your name (optional)"
              value={joinNickname}
              onChange={e => setJoinNickname(e.target.value)}
              maxLength={32}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px',
                marginBottom: 8,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.2)',
                color: 'var(--text)',
                fontSize: 14,
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Join as:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {emptySeats.map(i => (
                <button
                  key={i}
                  type="button"
                  disabled={joining}
                  onClick={() => joinSeat(i)}
                  style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: joining ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                >
                  Player {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {canStart && (
        <button
          type="button"
          disabled={starting}
          onClick={startGame}
          style={{ padding: '14px 28px', fontSize: 18, fontWeight: 'bold', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 12, cursor: starting ? 'not-allowed' : 'pointer' }}
        >
          {starting ? 'Starting…' : 'Start game'}
        </button>
      )}

      {error && <p style={{ color: '#fca5a5', margin: 0, fontSize: 14 }}>{error}</p>}

      <a href="/" style={{ color: 'var(--muted)', fontSize: 14 }}>Back to home</a>
    </div>
  )
}
