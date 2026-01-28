import { TERRAIN_COLORS, TERRAIN_LABELS } from '../game/terrain'
import { getBuildCost } from '../game/logic'
import { AnimatedResourceIcon } from './AnimatedResourceIcon'
import type { Terrain } from '../game/types'

function ResourceIcon({ type }: { type: Terrain }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 4,
        background: `${TERRAIN_COLORS[type]}33`,
        border: `1px solid ${TERRAIN_COLORS[type]}`,
        fontSize: 11,
        color: 'var(--text)',
      }}
    >
      {type === 'wheat' ? (
        <AnimatedResourceIcon
          image1="/wheat-icon.png"
          image2="/wheat-icon.png"
          alt="Wheat"
          size={12}
        />
      ) : type === 'ore' ? (
        <AnimatedResourceIcon
          image1="/ore-icon-1.png"
          image2="/ore-icon-2.png"
          alt="Ore"
          size={12}
        />
      ) : (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: TERRAIN_COLORS[type],
          }}
        />
      )}
      <span>{TERRAIN_LABELS[type]}</span>
    </span>
  )
}

export function BuildCostsLegend() {
  const roadCost = getBuildCost('road')
  const settlementCost = getBuildCost('settlement')
  const cityCost = getBuildCost('city')

  return (
    <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Build Costs
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Road</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(roadCost).map(([terrain, count]) => (
              <span key={terrain} style={{ fontSize: 11, color: 'var(--muted)' }}>
                {count}× <ResourceIcon type={terrain as Terrain} />
              </span>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Settlement</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(settlementCost).map(([terrain, count]) => (
              <span key={terrain} style={{ fontSize: 11, color: 'var(--muted)' }}>
                {count}× <ResourceIcon type={terrain as Terrain} />
              </span>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>City</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(cityCost).map(([terrain, count]) => (
              <span key={terrain} style={{ fontSize: 11, color: 'var(--muted)' }}>
                {count}× <ResourceIcon type={terrain as Terrain} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
