import type { GameState, GameLogEntry } from './types'

/** Append an entry to the game log (for History tab). */
export function appendGameLog(state: GameState, entry: Omit<GameLogEntry, 'id'>): GameState {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `log-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { ...state, gameLog: [...(state.gameLog || []), { ...entry, id }] }
}
