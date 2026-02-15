import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { trackEvent } from '../utils/analytics'
import { SETTLERS_PATH, settlersGameRoomUrl } from '../config/games'

const STORAGE_KEY = (gameId: string) => `supabase_game_${gameId}`

type GameRow = {
  id: string
  num_players: number
  phase: 'lobby' | 'setup' | 'playing' | 'ended'
  state: unknown
  oregons_omens?: boolean
  is_public?: boolean
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

/** Fetch public games (not ended) and all their players, then join in memory */
async function fetchPublicGamesAndPlayers(): Promise<{ games: GameRow[]; playersByGame: Map<string, GamePlayerRow[]> }> {
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('*')
    .eq('is_public', true)
    .neq('phase', 'ended')
    .order('created_at', { ascending: false })

  if (gamesError) return { games: [], playersByGame: new Map() }
  const gameList = (games ?? []) as GameRow[]

  if (gameList.length === 0) return { games: gameList, playersByGame: new Map() }

  const { data: players, error: playersError } = await supabase
    .from('game_players')
    .select('*')
    .in('game_id', gameList.map(g => g.id))

  if (playersError) return { games: gameList, playersByGame: new Map() }
  const playerList = (players ?? []) as GamePlayerRow[]
  const playersByGame = new Map<string, GamePlayerRow[]>()
  for (const p of playerList) {
    const arr = playersByGame.get(p.game_id) ?? []
    arr.push(p)
    playersByGame.set(p.game_id, arr)
  }
  for (const arr of playersByGame.values()) {
    arr.sort((a, b) => a.player_index - b.player_index)
  }
  return { games: gameList, playersByGame }
}

function getHostNickname(players: GamePlayerRow[]): string {
  const host = players.find(p => p.player_index === 0)
  return host?.nickname ?? '—'
}

function getPlayersLabel(count: number, numPlayers: number): string {
  if (count === 1 && numPlayers === 4) return '1/4 (3 Bots)'
  return `${count}/${numPlayers}`
}

export function LobbyBrowserPage() {
  const navigate = useNavigate()
  const [games, setGames] = useState<GameRow[]>([])
  const [playersByGame, setPlayersByGame] = useState<Map<string, GamePlayerRow[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showFullGames, setShowFullGames] = useState(false)
  const [searchHost, setSearchHost] = useState('')
  const [createNickname, setCreateNickname] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    const { games: g, playersByGame: p } = await fetchPublicGamesAndPlayers()
    setGames(g)
    setPlayersByGame(p)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    const prev = document.title
    document.title = 'Settlers of Oregon – Multiplayer Lobby'
    return () => { document.title = prev }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('lobby-browser')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players' },
        () => fetchData()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const filteredGames = useMemo(() => {
    let list = games
    if (!showFullGames) {
      list = list.filter(g => {
        const players = playersByGame.get(g.id) ?? []
        return players.length < g.num_players
      })
    }
    const q = searchHost.trim().toLowerCase()
    if (q) {
      list = list.filter(g => {
        const players = playersByGame.get(g.id) ?? []
        const hostName = getHostNickname(players).toLowerCase()
        return hostName.includes(q)
      })
    }
    return list
  }, [games, playersByGame, showFullGames, searchHost])

  const handleCreateGame = async () => {
    setCreating(true)
    setError(null)
    try {
      const { data: game, error: insertGameError } = await supabase
        .from('games')
        .insert({ num_players: 2, phase: 'lobby', oregons_omens: false, is_public: true })
        .select('id')
        .single()
      if (insertGameError) throw insertGameError
      const id = (game as { id: string }).id
      const { error: insertPlayerError } = await supabase
        .from('game_players')
        .insert({ game_id: id, player_index: 0, nickname: createNickname.trim() || 'Player 1' })
      if (insertPlayerError) throw insertPlayerError
      localStorage.setItem(STORAGE_KEY(id), JSON.stringify({ playerIndex: 0 }))
      trackEvent('multiplayer_game_created', 'multiplayer', 'lobby_browser')
      window.location.href = settlersGameRoomUrl(id, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create game')
      setCreating(false)
    }
  }

  const handleJoin = (gameId: string) => {
    trackEvent('multiplayer_join_clicked', 'multiplayer', 'lobby_browser')
    navigate(`${SETTLERS_PATH}/game/${gameId}`)
  }

  const handleSpectate = (gameId: string) => {
    navigate(`${SETTLERS_PATH}/game/${gameId}`)
  }

  return (
    <div
      className="parchment-page"
      style={{
        minHeight: '100vh',
        padding: 24,
        background: 'var(--parchment-bg)',
        color: 'var(--ink)',
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontFamily: '"Old Standard TT", Georgia, "Times New Roman", serif',
                textTransform: 'uppercase',
                letterSpacing: 2,
                color: 'var(--ink)',
              }}
            >
              Multiplayer Lobby
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--ink)', opacity: 0.85 }}>
              Join a public game or create your own.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <input
              type="text"
              placeholder="Your name (optional)"
              value={createNickname}
              onChange={e => setCreateNickname(e.target.value)}
              maxLength={32}
              style={{
                padding: '10px 14px',
                fontSize: 14,
                border: '1px solid var(--paper-border)',
                borderRadius: 8,
                background: 'var(--parchment-section)',
                color: 'var(--ink)',
                width: 160,
              }}
            />
            <button
              type="button"
              onClick={handleCreateGame}
              disabled={creating}
              style={{
                padding: '12px 24px',
                fontSize: 16,
                fontWeight: 700,
                background: 'var(--cta, #D58258)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: creating ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {creating ? 'Creating…' : 'Create New Game'}
            </button>
          </div>
        </header>

        <section style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--ink)' }}>
            <input
              type="checkbox"
              checked={showFullGames}
              onChange={e => setShowFullGames(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            Show Full Games
          </label>
          <input
            type="text"
            placeholder="Search by host nickname"
            value={searchHost}
            onChange={e => setSearchHost(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: 14,
              border: '1px solid var(--paper-border)',
              borderRadius: 8,
              background: 'var(--parchment-section)',
              color: 'var(--ink)',
              minWidth: 200,
            }}
          />
        </section>

        {error && (
          <p style={{ color: '#b91c1c', marginBottom: 16, fontSize: 14 }}>{error}</p>
        )}

        <div
          style={{
            background: 'var(--parchment-section)',
            borderRadius: 12,
            border: '1px solid var(--paper-border)',
            overflow: 'hidden',
          }}
        >
          {loading ? (
            <p style={{ padding: 32, textAlign: 'center', color: 'var(--ink)', opacity: 0.8 }}>Loading lobby…</p>
          ) : filteredGames.length === 0 ? (
            <p style={{ padding: 32, textAlign: 'center', color: 'var(--ink)', opacity: 0.8 }}>
              No games match. Create one above or adjust filters.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.06)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>Host</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>Players</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>Game Type</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredGames.map((game, idx) => {
                  const players = playersByGame.get(game.id) ?? []
                  const count = players.length
                  const isFull = count >= game.num_players
                  const inLobby = game.phase === 'lobby'
                  const canJoin = inLobby && !isFull
                  const hostName = getHostNickname(players)
                  const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.03)'
                  return (
                    <tr key={game.id} style={{ background: rowBg }}>
                      <td style={{ padding: '12px 16px', color: 'var(--ink)' }}>{hostName}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--ink)' }}>{getPlayersLabel(count, game.num_players)}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--ink)' }}>
                        {game.oregons_omens ? "Oregon's Omens Expansion" : 'Standard Game'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {canJoin ? (
                          <button
                            type="button"
                            onClick={() => handleJoin(game.id)}
                            style={{
                              padding: '8px 16px',
                              fontSize: 13,
                              fontWeight: 600,
                              background: 'var(--accent-sage, #8BAE9B)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 8,
                              cursor: 'pointer',
                            }}
                          >
                            Join Game
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSpectate(game.id)}
                            style={{
                              padding: '8px 16px',
                              fontSize: 13,
                              fontWeight: 600,
                              background: 'rgba(0,0,0,0.12)',
                              color: 'var(--ink)',
                              opacity: 0.8,
                              border: 'none',
                              borderRadius: 8,
                              cursor: 'pointer',
                            }}
                          >
                            Spectate
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ marginTop: 24, fontSize: 14, opacity: 0.7 }}>
          <Link to={SETTLERS_PATH} style={{ color: 'var(--cta)', textDecoration: 'none' }}>← Back to game</Link>
        </p>
      </div>
    </div>
  )
}
