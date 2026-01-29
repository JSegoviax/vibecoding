import { TERRAIN_COLORS, TERRAIN_LABELS } from '../game/terrain'
import { AnimatedResourceIcon } from './AnimatedResourceIcon'
import type { Terrain } from '../game/types'

const RESOURCE_OPTIONS: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

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
  lastDice?: [number, number] | null
  onRollDice?: () => void
  onEndTurn?: () => void
  robberMode?: { moving: boolean; newHexId: string | null; playersToRob: Set<number> }
  buildMode?: 'road' | 'settlement' | 'city' | null
  onSetBuildMode?: (mode: 'road' | 'settlement' | 'city' | null) => void
  tradeFormOpen?: boolean
  onSetTradeFormOpen?: (open: boolean) => void
  tradeGive?: Terrain
  onSetTradeGive?: (terrain: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => void
  tradeGet?: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'
  onSetTradeGet?: (terrain: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => void
  onTrade?: (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', get: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => void
  onSetErrorMessage?: (message: string | null) => void
  canAfford?: (player: PlayerForResources, structure: 'road' | 'settlement' | 'city') => boolean
  getMissingResources?: (player: PlayerForResources, structure: 'road' | 'settlement' | 'city') => Array<{ terrain: Terrain; need: number }>
  getTradeRate?: (give: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') => number
}

function ResourceChip({ type, count, flash }: { type: Terrain; count: number; flash?: boolean }) {
  return (
    <div
      className={flash ? 'resource-chip-flash' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 6,
        background: `${TERRAIN_COLORS[type]}33`,
        border: `1px solid ${TERRAIN_COLORS[type]}`,
        fontSize: 11,
        color: 'var(--text)',
      }}
      title={TERRAIN_LABELS[type]}
    >
      {type === 'wheat' ? (
        <AnimatedResourceIcon
          image1="/wheat-icon.png"
          image2="/wheat-icon.png"
          alt="Wheat"
          size={16}
        />
      ) : type === 'wood' ? (
        <img
          src="/wood-icon.png"
          alt="Wood"
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            imageRendering: 'pixelated',
          }}
        />
      ) : type === 'ore' ? (
        <img
          src="/ore-icon.png"
          alt="Ore"
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            imageRendering: 'pixelated',
          }}
        />
      ) : type === 'sheep' ? (
        <img
          src="/sheep-icon.png"
          alt="Sheep"
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            imageRendering: 'pixelated',
          }}
        />
      ) : type === 'brick' ? (
        <img
          src="/brick-icon.png"
          alt="Brick"
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            imageRendering: 'pixelated',
          }}
        />
      ) : (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: TERRAIN_COLORS[type],
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ fontWeight: 500 }}>{TERRAIN_LABELS[type]}</span>
      <span style={{ fontWeight: 600, marginLeft: 2 }}>{count}</span>
    </div>
  )
}

export function PlayerResources({ 
  players, 
  activePlayerIndex, 
  phase, 
  lastResourceFlash, 
  lastDice, 
  onRollDice, 
  onEndTurn, 
  robberMode,
  buildMode,
  onSetBuildMode,
  tradeFormOpen,
  onSetTradeFormOpen,
  tradeGive,
  onSetTradeGive,
  tradeGet,
  onSetTradeGet,
  onTrade,
  onSetErrorMessage,
  canAfford,
  getMissingResources,
  getTradeRate,
}: PlayerResourcesProps) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Resources
      </div>
      {players.map((p, i) => {
        const isActive = phase === 'setup' ? activePlayerIndex === i : activePlayerIndex === i
        const showControls = phase === 'playing' && isActive && onRollDice && onEndTurn
        const showBuildControls = phase === 'playing' && isActive && lastDice != null && onSetBuildMode && canAfford && getMissingResources
        return (
          <div
            key={p.id}
            style={{
              marginBottom: 6,
              padding: 8,
              borderRadius: 8,
              background: isActive ? 'rgba(100,181,246,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isActive ? 'rgba(100,181,246,0.4)' : 'transparent'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 'bold', color: p.color, fontSize: 13 }}>{p.name}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.victoryPoints} VP</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {RESOURCE_TYPES.map(t => (
                <ResourceChip
                  key={t}
                  type={t}
                  count={p.resources[t] ?? 0}
                  flash={lastResourceFlash?.[i]?.includes(t)}
                />
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
              {p.settlementsLeft} S · {p.citiesLeft} C · {p.roadsLeft} R
            </div>
            {showControls && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {lastDice == null ? (
                  <button 
                    onClick={onRollDice} 
                    style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: 12 }}
                  >
                    Roll dice
                  </button>
                ) : (
                  <>
                    {!robberMode?.moving && !robberMode?.newHexId && (
                      <button 
                        onClick={onEndTurn} 
                        style={{ padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--muted)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}
                      >
                        End turn
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            {showBuildControls && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      if (p.roadsLeft <= 0) return
                      if (!canAfford(p, 'road')) {
                        onSetErrorMessage?.('Insufficient resources. Need: ' + getMissingResources(p, 'road').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
                        return
                      }
                      onSetBuildMode(buildMode === 'road' ? null : 'road')
                      onSetErrorMessage?.(null)
                    }}
                    disabled={p.roadsLeft <= 0}
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--muted)', background: buildMode === 'road' ? 'rgba(100,181,246,0.3)' : 'transparent', color: 'var(--text)', cursor: p.roadsLeft <= 0 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: p.roadsLeft <= 0 ? 0.5 : 1 }}
                  >Road</button>
                  <button
                    onClick={() => {
                      if (p.settlementsLeft <= 0) return
                      if (!canAfford(p, 'settlement')) {
                        onSetErrorMessage?.('Insufficient resources. Need: ' + getMissingResources(p, 'settlement').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
                        return
                      }
                      onSetBuildMode(buildMode === 'settlement' ? null : 'settlement')
                      onSetErrorMessage?.(null)
                    }}
                    disabled={p.settlementsLeft <= 0}
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--muted)', background: buildMode === 'settlement' ? 'rgba(100,181,246,0.3)' : 'transparent', color: 'var(--text)', cursor: p.settlementsLeft <= 0 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: p.settlementsLeft <= 0 ? 0.5 : 1 }}
                  >Settlement</button>
                  <button
                    onClick={() => {
                      if (p.citiesLeft <= 0) return
                      if (!canAfford(p, 'city')) {
                        onSetErrorMessage?.('Insufficient resources. Need: ' + getMissingResources(p, 'city').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
                        return
                      }
                      onSetBuildMode(buildMode === 'city' ? null : 'city')
                      onSetErrorMessage?.(null)
                    }}
                    disabled={p.citiesLeft <= 0}
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--muted)', background: buildMode === 'city' ? 'rgba(100,181,246,0.3)' : 'transparent', color: 'var(--text)', cursor: p.citiesLeft <= 0 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: p.citiesLeft <= 0 ? 0.5 : 1 }}
                  >City</button>
                  <button
                    onClick={() => { onSetTradeFormOpen?.(!tradeFormOpen); onSetErrorMessage?.(null) }}
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--muted)', background: tradeFormOpen ? 'rgba(100,181,246,0.3)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}
                  >Trade (4:1)</button>
                </div>
                {tradeFormOpen && onSetTradeGive && onSetTradeGet && tradeGive && tradeGet && (() => {
                  const tradeRate = getTradeRate && tradeGive !== 'desert' ? getTradeRate(tradeGive as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') : 4
                  return (
                    <div style={{ padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--muted)' }}>
                      <div style={{ fontSize: 12, marginBottom: 6 }}>
                        Give {tradeRate} of one, get 1 of another:
                        {tradeRate < 4 && (
                          <span style={{ marginLeft: 6, color: '#fbbf24', fontSize: 11 }}>
                            (Harbor rate: {tradeRate}:1)
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ fontSize: 12 }}>
                          Give {tradeRate}: <select value={tradeGive} onChange={e => onSetTradeGive(e.target.value as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore')} style={{ marginLeft: 4, padding: 4, borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--muted)' }}>
                            {RESOURCE_OPTIONS.filter(t => t !== 'desert').map(t => <option key={t} value={t}>{TERRAIN_LABELS[t]} ({p.resources[t] || 0})</option>)}
                          </select>
                        </label>
                        <label style={{ fontSize: 12 }}>
                          Get 1: <select value={tradeGet} onChange={e => onSetTradeGet(e.target.value as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore')} style={{ marginLeft: 4, padding: 4, borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--muted)' }}>
                            {RESOURCE_OPTIONS.filter(t => t !== 'desert').map(t => <option key={t} value={t}>{TERRAIN_LABELS[t]}</option>)}
                          </select>
                        </label>
                        <button onClick={() => { if ((p.resources[tradeGive] || 0) < tradeRate) { onSetErrorMessage?.(`Insufficient resources. Need ${tradeRate} ${TERRAIN_LABELS[tradeGive]} to trade.`) } else { onTrade?.(tradeGive as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', tradeGet as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') } }} style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12 }}>Confirm</button>
                        <button onClick={() => onSetTradeFormOpen?.(false)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--muted)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
