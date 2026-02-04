/**
 * Hexhobbyist.com games config.
 * Central source for slugs, paths, and metadata.
 */

export const SITE_NAME = 'Hexhobbyist'

/** Oregon Capitalist is behind a secret — not shown in games list. Unlock via gesture + password. */
export const OREGON_CAPITALIST_STORAGE_KEY = 'oc_unlocked'
export const OREGON_CAPITALIST_PASSWORD =
  import.meta.env?.VITE_OREGON_CAPITALIST_PASSWORD ?? 'frontier'

export const GAMES = [
  {
    slug: 'settlers-of-oregon',
    name: 'Settlers of Oregon',
    description: 'Catan-style hex board game with Oregon Trail theme. Single player vs AI or multiplayer.',
    path: '/games/settlers-of-oregon',
    isNew: false,
    hidden: false,
  },
  {
    slug: 'oregon-capitalist',
    name: 'Oregon Capitalist',
    description: 'Idle clicker game. Build businesses on the frontier and grow your empire.',
    path: '/games/oregon-capitalist',
    isNew: true,
    hidden: true,
  },
] as const

export type GameSlug = (typeof GAMES)[number]['slug']

/** Base path for Settlers of Oregon (used for multiplayer game rooms) */
export const SETTLERS_PATH = '/games/settlers-of-oregon'

/** Full URL for a Settlers multiplayer game room */
export function settlersGameRoomUrl(gameId: string, host = false): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}${SETTLERS_PATH}/game/${gameId}${host ? '?host=1' : ''}`
}

export function getGameBySlug(slug: string) {
  return GAMES.find((g) => g.slug === slug)
}

/** Games visible in the main list (excludes hidden/secret games). */
export function getVisibleGames() {
  return GAMES.filter((g) => !('hidden' in g) || !g.hidden)
}
