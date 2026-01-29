import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { createInitialState } from '../game/state'
import { MultiplayerGame } from './MultiplayerGame'
import type { GameState } from '../game/types'

const STORAGE_KEY = (gameId: string) => `supabase_game_${gameId}`

type GameRow = {
  id: string
  num_players: number
  phase: 'lobby' | 'setup' | 'playing' | 'ended'
  state: GameState | null
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
  const [myPlayerIndex, setMyPlayerIndex] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY(gameId))
      if (!raw) return null
      const data = JSON.parse(raw) as { playerIndex: number }
      return typeof data.playerIndex === 'number' ? data.playerIndex : null
    } catch {
      return null
    }
  })
  const [joining, setJoining] = useState(false)
  const [starting, setStarting] = useState(false)

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

  const joinSeat = async (playerIndex: number) => {
    setJoining(true)
    const { error: e } = await supabase.from('game_players').insert({
      game_id: gameId,
      player_index: playerIndex,
      nickname: `Player ${playerIndex + 1}`,
    })
    setJoining(false)
    if (e) {
      setError(e.message)
      return
    }
    localStorage.setItem(STORAGE_KEY(gameId), JSON.stringify({ playerIndex }))
    setMyPlayerIndex(playerIndex)
    await fetchPlayers()
  }

  const startGame = async () => {
    if (!game || game.phase !== 'lobby' || myPlayerIndex !== 0 || players.length < 2) return
    setStarting(true)
    const numPlayers = game.num_players as 2 | 3 | 4
    const colors = defaultColors.slice(0, numPlayers)
    const state = createInitialState(numPlayers, [...colors], { multiplayer: true })
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
    await fetchGame()
  }

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/game/${gameId}` : ''

  const copyLink = () => {
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
        <a href="/" style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Back to home</a>
      </div>
    )
  }

  if (!game) return null

  if (game.phase !== 'lobby' && game.state && myPlayerIndex !== null) {
    return (
      <MultiplayerGame
        gameId={gameId}
        myPlayerIndex={myPlayerIndex}
        initialState={{ ...game.state, setupPendingVertexId: game.state.setupPendingVertexId ?? null }}
      />
    )
  }

  if (game.phase !== 'lobby') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, background: 'linear-gradient(180deg, rgb(26, 31, 46) 0%, rgb(45, 55, 72) 100%)', color: 'var(--text)' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Game started</h1>
        <p style={{ color: 'var(--muted)', margin: 0, textAlign: 'center', maxWidth: 400 }}>
          You need to join this game with the link to play. If you already joined, refresh the page.
        </p>
        <a href="/" style={{ padding: '12px 24px', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 'bold', textDecoration: 'none' }}>Back to home</a>
      </div>
    )
  }

  const takenSeats = new Set(players.map(p => p.player_index))
  const emptySeats = Array.from({ length: game.num_players }, (_, i) => i).filter(i => !takenSeats.has(i))
  const isHost = myPlayerIndex === 0
  const canStart = isHost && players.length >= 2

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
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>Players ({players.length}/{game.num_players})</div>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {players.map(p => (
            <li key={p.id} style={{ marginBottom: 6 }}>
              Player {p.player_index + 1}
              {myPlayerIndex === p.player_index && <span style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 12 }}>(you)</span>}
            </li>
          ))}
        </ul>
        {emptySeats.length > 0 && (
          <div style={{ marginTop: 16 }}>
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
