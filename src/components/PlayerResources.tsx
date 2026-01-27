import { TERRAIN_COLORS, TERRAIN_LABELS } from '../game/terrain'
import type { Terrain } from '../game/types'

const RESOURCE_TYPES: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

export interface PlayerForResources {
  id: number
  name: string
  color: string
  victoryPoints: number
  resources: Record<Terrain, number>
  settlementsLeft: number
  citiesLeft: number
  roadsLeft: number
}

interface PlayerResourcesProps {
  players: PlayerForResources[]
  activePlayerIndex: number
  phase: 'setup' | 'playing' | 'ended'
  lastResourceFlash?: Record<number, Terrain[]> | null
}

function ResourceChip({ type, count, flash }: { type: Terrain; count: number; flash?: boolean }) {
  return (
    <div
      className={flash ? 'resource-chip-flash' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 6,
        background: `${TERRAIN_COLORS[type]}33`,
        border: `1px solid ${TERRAIN_COLORS[type]}`,
        fontSize: 12,
        color: 'var(--text)',
      }}
      title={TERRAIN_LABELS[type]}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: TERRAIN_COLORS[type],
        }}
      />
      <span>{count}</span>
    </div>
  )
}

export function PlayerResources({ players, activePlayerIndex, phase, lastResourceFlash }: PlayerResourcesProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Resources
      </div>
      {players.map((p, i) => {
        const isActive = phase === 'setup' ? activePlayerIndex === i : activePlayerIndex === i
        return (
          <div
            key={p.id}
            style={{
              marginBottom: 10,
              padding: 12,
              borderRadius: 10,
              background: isActive ? 'rgba(100,181,246,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isActive ? 'rgba(100,181,246,0.4)' : 'transparent'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 'bold', color: p.color, fontSize: 14 }}>{p.name}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{p.victoryPoints} VP</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {RESOURCE_TYPES.map(t => (
                <ResourceChip
                  key={t}
                  type={t}
                  count={p.resources[t] ?? 0}
                  flash={lastResourceFlash?.[i]?.includes(t)}
                />
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
              {p.settlementsLeft} S · {p.citiesLeft} C · {p.roadsLeft} R
            </div>
          </div>
        )
      })}
    </div>
  )
}
