import { useState } from 'react'
import { trackEvent } from '../utils/analytics'

const STORAGE_KEY = (gameId: string) => `supabase_game_${gameId}`

function parseGameId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // If it looks like a full URL, extract the id after /game/
  const match = trimmed.match(/\/game\/([a-f0-9-]+)$/i)
  if (match) return match[1]
  // Otherwise treat as raw uuid
  if (/^[a-f0-9-]{36}$/i.test(trimmed)) return trimmed
  return trimmed
}

export function MultiplayerLobby({ onBack }: { onBack: () => void }) {
  const [numPlayers, setNumPlayers] = useState<2 | 3 | 4>(2)
  const [oregonsOmens, setOregonsOmens] = useState(false)
  const [joinGameId, setJoinGameId] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    try {
      const { supabase } = await import('../lib/supabase')
      const { data: game, error: insertGameError } = await supabase
        .from('games')
        .insert({ num_players: numPlayers, phase: 'lobby', oregons_omens: oregonsOmens })
        .select('id')
        .single()
      if (insertGameError) throw insertGameError
      const id = (game as { id: string }).id
      const { error: insertPlayerError } = await supabase
        .from('game_players')
        .insert({ game_id: id, player_index: 0, nickname: 'Player 1' })
      if (insertPlayerError) throw insertPlayerError
      localStorage.setItem(STORAGE_KEY(id), JSON.stringify({ playerIndex: 0 }))
      trackEvent('multiplayer_game_created', 'multiplayer', `players_${numPlayers}`)
      window.location.href = `/game/${id}?host=1`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create game')
      setCreating(false)
    }
  }

  const handleJoin = () => {
    const id = parseGameId(joinGameId)
    if (!id) {
      setError('Enter a game ID or paste the game link')
      return
    }
    setError(null)
    trackEvent('multiplayer_join_clicked', 'multiplayer', 'join_by_link')
    window.location.href = `/game/${id}`
  }

  return (
    <div
      className="parchment-page"
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
      <div className="paper-section" style={{ maxWidth: 480, width: '100%' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            color: 'var(--ink)',
            fontFamily: '"Old Standard TT", Georgia, "Times New Roman", serif',
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          Multiplayer
        </h1>
        <p style={{ color: 'var(--ink)', opacity: 0.85, margin: 0, maxWidth: 400, textAlign: 'center' }}>
          Create a game and share the link, or join with a link from a friend.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 280, marginTop: 24 }}>
          <div style={{ background: 'var(--parchment-section)', borderRadius: 12, padding: 20, border: '1px solid var(--paper-border)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--ink)' }}>Create game</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ color: 'var(--ink)', opacity: 0.85, fontSize: 14 }}>Players:</span>
              {([2, 3, 4] as const).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNumPlayers(n)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: numPlayers === n ? '2px solid var(--cta)' : '1px solid var(--paper-border)',
                    background: numPlayers === n ? 'var(--cta)' : 'transparent',
                    color: numPlayers === n ? '#fff' : 'var(--ink)',
                    cursor: 'pointer',
                    fontWeight: numPlayers === n ? 'bold' : 'normal',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 14, color: 'var(--ink)' }}>
              <input
                type="checkbox"
                checked={oregonsOmens}
                onChange={e => setOregonsOmens(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>Oregon&apos;s Omens (card variant)</span>
            </label>
            <button
              type="button"
              disabled={creating}
              onClick={handleCreate}
              style={{
                width: '100%',
                padding: '12px 24px',
                fontSize: 16,
                fontWeight: 'bold',
                background: 'var(--cta)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: creating ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              {creating ? 'Creating…' : 'Create game'}
            </button>
          </div>

          <div style={{ background: 'var(--parchment-section)', borderRadius: 12, padding: 20, border: '1px solid var(--paper-border)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--ink)' }}>Join game</div>
            <input
              type="text"
              placeholder="Paste game link or game ID"
              value={joinGameId}
              onChange={e => setJoinGameId(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--paper-border)',
                background: 'var(--parchment-bg)',
                color: 'var(--ink)',
                fontSize: 14,
                marginBottom: 12,
              }}
            />
            <button
              type="button"
              onClick={handleJoin}
              style={{
                width: '100%',
                padding: '12px 24px',
                fontSize: 16,
                fontWeight: 'bold',
                background: 'transparent',
                color: 'var(--ink)',
                border: '2px solid var(--paper-border)',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Join game
            </button>
          </div>
        </div>

        {error && <p style={{ color: '#7f1d1d', margin: '16px 0 0', fontSize: 14 }}>{error}</p>}

        <button
          type="button"
          onClick={onBack}
          style={{
            marginTop: 24,
            padding: '12px 24px',
            fontSize: 16,
            fontWeight: 'bold',
            background: 'transparent',
            color: 'var(--ink)',
            opacity: 0.9,
            border: '2px solid var(--paper-border)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>
    </div>
  )
}
