import type { GameLogEntry } from '../game/types'

interface GameHistoryProps {
  gameLog: GameLogEntry[]
  maxHeight?: number
}

export function GameHistory({ gameLog, maxHeight = 320 }: GameHistoryProps) {
  if (!gameLog || gameLog.length === 0) {
    return (
      <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>
        No events yet. Dice rolls, builds, robberies, and omen plays will appear here.
      </div>
    )
  }

  return (
    <div
      style={{
        overflowY: 'auto',
        maxHeight,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 0',
      }}
      role="log"
      aria-label="Game history"
    >
      {[...gameLog].reverse().map((entry) => (
        <div
          key={entry.id}
          style={{
            fontSize: 12,
            lineHeight: 1.4,
            padding: '6px 10px',
            borderRadius: 6,
            background: entryTypeBg(entry.type),
            borderLeft: `3px solid ${entryTypeColor(entry.type)}`,
            color: 'var(--text)',
          }}
        >
          {entry.message}
        </div>
      ))}
    </div>
  )
}

function entryTypeColor(type: GameLogEntry['type']): string {
  switch (type) {
    case 'dice':
      return 'var(--accent)'
    case 'resources':
      return '#22c55e'
    case 'robbery':
      return '#e11d48'
    case 'build':
      return '#8b5cf6'
    case 'turn':
      return 'var(--muted)'
    case 'omen_play':
    case 'omen_buff':
      return '#d97706'
    case 'omen_draw_debuff':
      return '#dc2626'
    case 'pantry_negate':
      return '#16a34a'
    case 'setup':
      return 'var(--muted)'
    default:
      return 'var(--muted)'
  }
}

function entryTypeBg(type: GameLogEntry['type']): string {
  const c = entryTypeColor(type)
  return `${c}15`
}
