import type { Vertex } from '../game/types'

interface PlayerInfo {
  id: number
  name: string
  color: string
}

interface VictoryPointTrackerProps {
  vertices: Record<string, Vertex>
  players: PlayerInfo[]
  activePlayerIndex: number
  phase: string
}

function getVPBreakdown(vertices: Record<string, Vertex>, playerId: number) {
  let settlements = 0
  let cities = 0
  for (const v of Object.values(vertices)) {
    if (!v.structure || v.structure.player !== playerId) continue
    if (v.structure.type === 'settlement') settlements++
    if (v.structure.type === 'city') cities++
  }
  const fromSettlements = settlements * 1
  const fromCities = cities * 2
  return { settlements, cities, fromSettlements, fromCities, total: fromSettlements + fromCities }
}

export function VictoryPointTracker({ vertices, players, activePlayerIndex, phase }: VictoryPointTrackerProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Victory points
      </div>
      {players.map((p, i) => {
        const { settlements, cities, fromSettlements, fromCities, total } = getVPBreakdown(vertices, p.id)
        const isActive = phase === 'setup' ? activePlayerIndex === i : activePlayerIndex === i
        return (
          <div
            key={p.id}
            style={{
              marginBottom: 10,
              padding: 10,
              borderRadius: 8,
              background: isActive ? 'rgba(100,181,246,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isActive ? 'rgba(100,181,246,0.35)' : 'transparent'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 'bold', color: p.color, fontSize: 13 }}>{p.name}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{total} VP</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              {settlements > 0 && (
                <div>Settlements: {settlements} × 1 = {fromSettlements}</div>
              )}
              {cities > 0 && (
                <div>Cities: {cities} × 2 = {fromCities}</div>
              )}
              {settlements === 0 && cities === 0 && (
                <div style={{ fontStyle: 'italic' }}>No structures yet</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
