import { useState } from 'react'

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
        .insert({ num_players: numPlayers, phase: 'lobby' })
        .select('id')
        .single()
      if (insertGameError) throw insertGameError
      const id = (game as { id: string }).id
      const { error: insertPlayerError } = await supabase
        .from('game_players')
        .insert({ game_id: id, player_index: 0, nickname: 'Player 1' })
      if (insertPlayerError) throw insertPlayerError
      localStorage.setItem(STORAGE_KEY(id), JSON.stringify({ playerIndex: 0 }))
      window.location.href = `/game/${id}`
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
    window.location.href = `/game/${id}`
  }

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
      <h1 style={{ margin: 0, fontSize: 28 }}>Multiplayer</h1>
      <p style={{ color: 'var(--muted)', margin: 0, maxWidth: 400, textAlign: 'center' }}>
        Create a game and share the link, or join with a link from a friend.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 280 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Create game</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>Players:</span>
            {([2, 3, 4] as const).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setNumPlayers(n)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: numPlayers === n ? '2px solid var(--accent)' : '1px solid var(--muted)',
                  background: numPlayers === n ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: numPlayers === n ? 'bold' : 'normal',
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={handleCreate}
            style={{
              width: '100%',
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 'bold',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: creating ? 'not-allowed' : 'pointer',
            }}
          >
            {creating ? 'Creating…' : 'Create game'}
          </button>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Join game</div>
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
              border: '1px solid var(--muted)',
              background: 'var(--background)',
              color: 'var(--text)',
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
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '2px solid var(--muted)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Join game
          </button>
        </div>
      </div>

      {error && <p style={{ color: '#fca5a5', margin: 0, fontSize: 14 }}>{error}</p>}

      <button
        type="button"
        onClick={onBack}
        style={{
          padding: '12px 24px',
          fontSize: 16,
          fontWeight: 'bold',
          background: 'transparent',
          color: 'var(--muted)',
          border: '2px solid var(--muted)',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Back
      </button>
    </div>
  )
}
