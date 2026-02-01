import { useState } from 'react'
import { TERRAIN_COLORS, TERRAIN_LABELS } from '../game/terrain'
import { AnimatedResourceIcon } from './AnimatedResourceIcon'
import { BuildCostsInline, type BuildCostDebuffSources } from './BuildCostsLegend'
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
  /** Oregon's Omens: card IDs in hand (for Omen counter when variant enabled) */
  omensHand?: string[]
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
  onSelectPlayerToRob?: (playerId: number) => void
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
  /** When false, Road button is greyed out and disabled (e.g. can't afford or no valid spots) */
  canBuildRoad?: boolean
  /** When false, Settlement button is greyed out and disabled */
  canBuildSettlement?: boolean
  /** When false, City button is greyed out and disabled */
  canBuildCity?: boolean
  /** Oregon's Omens: whether the variant is enabled this game */
  oregonsOmensEnabled?: boolean
  /** Oregon's Omens: whether the active player can draw a card (cost 1W+1S+1O, hand limit, etc.) */
  canDrawOmenCard?: boolean
  /** Oregon's Omens: callback to draw one card */
  onDrawOmenCard?: () => void
  /** Oregon's Omens: number of cards in the active player's hand (for display) */
  omensHandCount?: number
  /** Oregon's Omens: card IDs in the active player's hand (for list + play) */
  omensHand?: string[]
  /** Oregon's Omens: whether the active player can play this card (phase, turn, preconditions) */
  canPlayOmenCard?: (cardId: string) => boolean
  /** Oregon's Omens: play a buff card from hand */
  onPlayOmenCard?: (cardId: string) => void
  /** Oregon's Omens: get display name for a card ID */
  getOmenCardName?: (cardId: string) => string
  /** Oregon's Omens: get short effect text for a card ID */
  getOmenCardEffectText?: (cardId: string) => string
  /** Oregon's Omens: active effects for the current player (for display) */
  activeOmensEffects?: Array<{ cardId: string; turnsRemaining?: number; rollsRemaining?: number; appliedEffect: Record<string, unknown> }>
  /** Oregon's Omens: get short description for an active effect */
  getActiveEffectDescription?: (effect: { cardId: string; turnsRemaining?: number; rollsRemaining?: number; appliedEffect: Record<string, unknown> }) => string
  /** Oregon's Omens: effective build cost per structure (for debuff UI); when provided, build cost rows use this and show asterisk + tooltip for debuffed resources */
  getEffectiveBuildCostForPlayer?: (playerId: number, structure: 'road' | 'settlement' | 'city') => Partial<Record<Terrain, number>>
  /** Oregon's Omens: which cards are increasing each resource's cost per structure (for asterisk tooltip/modal) */
  getBuildCostDebuffSourcesForPlayer?: (playerId: number) => BuildCostDebuffSources
}

function ResourceChip({ type, count, flash }: { type: Terrain; count: number; flash?: boolean }) {
  return (
    <div
      className={`resource-chip ${flash ? 'resource-chip-flash' : ''}`.trim()}
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
  onSelectPlayerToRob,
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
  canBuildRoad,
  canBuildSettlement,
  canBuildCity,
  oregonsOmensEnabled,
  canDrawOmenCard,
  onDrawOmenCard,
  omensHandCount = 0,
  omensHand = [],
  canPlayOmenCard,
  onPlayOmenCard,
  getOmenCardName = (id: string) => id.replace(/_/g, ' '),
  getOmenCardEffectText = () => '',
  activeOmensEffects = [],
  getActiveEffectDescription,
  getEffectiveBuildCostForPlayer,
  getBuildCostDebuffSourcesForPlayer,
}: PlayerResourcesProps) {
  const [omensCardDetailId, setOmensCardDetailId] = useState<string | null>(null)
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
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid transparent',
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
              {oregonsOmensEnabled && (
                <div
                  className="resource-chip"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: 'rgba(139, 92, 246, 0.25)',
                    border: '1px solid rgba(139, 92, 246, 0.6)',
                    fontSize: 11,
                    color: 'var(--text)',
                  }}
                  title="Omen cards in hand"
                >
                  <span style={{ fontWeight: 500 }}>Omen</span>
                  <span style={{ fontWeight: 600, marginLeft: 2 }}>{p.omensHand?.length ?? 0}</span>
                </div>
              )}
            </div>
            {showControls && lastDice == null && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button 
                  onClick={onRollDice} 
                  style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: 12 }}
                >
                  Roll dice
                </button>
              </div>
            )}
            {isActive && robberMode?.newHexId && (robberMode.playersToRob?.size ?? 0) > 0 && onSelectPlayerToRob && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(100,181,246,0.1)', border: '1px solid rgba(100,181,246,0.3)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Select player to rob:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Array.from(robberMode.playersToRob).map(pid => {
                    const target = players[pid - 1]
                    if (!target) return null
                    const totalResources = (target.resources.wood || 0) + (target.resources.brick || 0) + (target.resources.sheep || 0) + (target.resources.wheat || 0) + (target.resources.ore || 0)
                    return (
                      <button
                        key={pid}
                        onClick={() => onSelectPlayerToRob(pid)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid var(--muted)',
                          background: 'var(--surface)',
                          color: target.color,
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: 13,
                          opacity: totalResources === 0 ? 0.8 : 1,
                        }}
                      >
                        {target.name} ({totalResources} resources){totalResources === 0 ? ' — rob anyway' : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {showBuildControls && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(100,181,246,0.08)', border: '1px solid rgba(100,181,246,0.3)' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {lastDice != null && onEndTurn && !robberMode?.moving && !robberMode?.newHexId && (
                    <button
                      onClick={onEndTurn}
                      style={{ padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--muted)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                    >
                      End turn
                    </button>
                  )}
                  {(() => {
                    const roadDisabled = p.roadsLeft <= 0 || canBuildRoad === false
                    const settlementDisabled = p.settlementsLeft <= 0 || canBuildSettlement === false
                    const cityDisabled = p.citiesLeft <= 0 || canBuildCity === false
                    const greyStyle = { opacity: 0.5, cursor: 'not-allowed' as const }
                    return (
                      <>
                        <button
                          onClick={() => {
                            if (roadDisabled) return
                            if (!canAfford(p, 'road')) {
                              onSetErrorMessage?.('Insufficient resources. Need: ' + getMissingResources(p, 'road').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
                              return
                            }
                            onSetBuildMode(buildMode === 'road' ? null : 'road')
                            onSetErrorMessage?.(null)
                          }}
                          disabled={roadDisabled}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid var(--muted)',
                            background: buildMode === 'road' ? 'rgba(100,181,246,0.3)' : 'transparent',
                            color: roadDisabled ? 'var(--muted)' : 'var(--text)',
                            cursor: roadDisabled ? 'not-allowed' : 'pointer',
                            fontSize: 12,
                            ...(roadDisabled ? greyStyle : {}),
                          }}
                        >Road</button>
                        <button
                          onClick={() => {
                            if (settlementDisabled) return
                            if (!canAfford(p, 'settlement')) {
                              onSetErrorMessage?.('Insufficient resources. Need: ' + getMissingResources(p, 'settlement').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
                              return
                            }
                            onSetBuildMode(buildMode === 'settlement' ? null : 'settlement')
                            onSetErrorMessage?.(null)
                          }}
                          disabled={settlementDisabled}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid var(--muted)',
                            background: buildMode === 'settlement' ? 'rgba(100,181,246,0.3)' : 'transparent',
                            color: settlementDisabled ? 'var(--muted)' : 'var(--text)',
                            cursor: settlementDisabled ? 'not-allowed' : 'pointer',
                            fontSize: 12,
                            ...(settlementDisabled ? greyStyle : {}),
                          }}
                        >Settlement</button>
                        <button
                          onClick={() => {
                            if (cityDisabled) return
                            if (!canAfford(p, 'city')) {
                              onSetErrorMessage?.('Insufficient resources. Need: ' + getMissingResources(p, 'city').map(m => `${m.need} ${TERRAIN_LABELS[m.terrain]}`).join(', '))
                              return
                            }
                            onSetBuildMode(buildMode === 'city' ? null : 'city')
                            onSetErrorMessage?.(null)
                          }}
                          disabled={cityDisabled}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid var(--muted)',
                            background: buildMode === 'city' ? 'rgba(100,181,246,0.3)' : 'transparent',
                            color: cityDisabled ? 'var(--muted)' : 'var(--text)',
                            cursor: cityDisabled ? 'not-allowed' : 'pointer',
                            fontSize: 12,
                            ...(cityDisabled ? greyStyle : {}),
                          }}
                        >City</button>
                        {oregonsOmensEnabled && (
                          <button
                            onClick={() => { if (canDrawOmenCard) onDrawOmenCard?.() }}
                            disabled={!canDrawOmenCard}
                            title="Cost: 1 Wheat, 1 Sheep, 1 Ore. Draw one Omen card (max 5 in hand)."
                            style={{
                              padding: '6px 12px',
                              borderRadius: 6,
                              border: '1px solid var(--muted)',
                              background: canDrawOmenCard ? 'transparent' : 'transparent',
                              color: canDrawOmenCard ? 'var(--text)' : 'var(--muted)',
                              cursor: canDrawOmenCard ? 'pointer' : 'not-allowed',
                              fontSize: 12,
                              ...(!canDrawOmenCard ? { opacity: 0.5 } : {}),
                            }}
                          >
                            Draw Omen ({omensHandCount}/5)
                          </button>
                        )}
                      </>
                    )
                  })()}
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
            {/* Oregon's Omens: active effects (current player) */}
            {oregonsOmensEnabled && isActive && phase === 'playing' && activeOmensEffects.length > 0 && getActiveEffectDescription && (
              <div style={{ marginTop: 8, padding: 6, borderRadius: 6, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Active effects</div>
                <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
                  {activeOmensEffects.map((eff, idx) => (
                    <li key={`${eff.cardId}-${idx}`} style={{ marginBottom: 2 }}>{getActiveEffectDescription(eff)}</li>
                  ))}
                </ul>
              </div>
            )}
            {/* Oregon's Omens: hand list (active player only) */}
            {oregonsOmensEnabled && isActive && phase === 'playing' && omensHand.length > 0 && (
              <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'rgba(139,69,19,0.15)', border: '1px solid rgba(139,69,19,0.4)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Omen cards</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {omensHand.map((cardId: string, idx: number) => (
                    <button
                      key={`${cardId}-${idx}`}
                      onClick={() => setOmensCardDetailId(cardId)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--muted)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontSize: 11,
                        textAlign: 'left',
                        maxWidth: 140,
                      }}
                      title={getOmenCardEffectText(cardId)}
                    >
                      {getOmenCardName(cardId)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Build costs inside player card: have/cost and red when insufficient; when Omens enabled, show effective cost and debuff asterisk + tooltip/modal */}
            {phase === 'playing' && (
              <BuildCostsInline
                playerResources={p.resources}
                roadCost={oregonsOmensEnabled && getEffectiveBuildCostForPlayer ? getEffectiveBuildCostForPlayer(p.id, 'road') : undefined}
                settlementCost={oregonsOmensEnabled && getEffectiveBuildCostForPlayer ? getEffectiveBuildCostForPlayer(p.id, 'settlement') : undefined}
                cityCost={oregonsOmensEnabled && getEffectiveBuildCostForPlayer ? getEffectiveBuildCostForPlayer(p.id, 'city') : undefined}
                debuffSources={oregonsOmensEnabled && getBuildCostDebuffSourcesForPlayer ? getBuildCostDebuffSourcesForPlayer(p.id) : undefined}
                getOmenCardName={getOmenCardName}
              />
            )}
          </div>
        )
      })}
      {/* Card detail modal (Oregon's Omens) */}
      {oregonsOmensEnabled && omensCardDetailId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setOmensCardDetailId(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 20,
              maxWidth: 320,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              border: '1px solid var(--muted)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 'bold', color: 'var(--text)', marginBottom: 8 }}>
              {getOmenCardName(omensCardDetailId)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              {getOmenCardEffectText(omensCardDetailId)}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  if (canPlayOmenCard?.(omensCardDetailId)) {
                    onPlayOmenCard?.(omensCardDetailId)
                    setOmensCardDetailId(null)
                  }
                }}
                disabled={!canPlayOmenCard?.(omensCardDetailId)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: canPlayOmenCard?.(omensCardDetailId) ? 'var(--accent)' : 'var(--muted)',
                  border: 'none',
                  color: '#fff',
                  cursor: canPlayOmenCard?.(omensCardDetailId) ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: canPlayOmenCard?.(omensCardDetailId) ? 1 : 0.6,
                }}
              >
                Play card
              </button>
              <button
                onClick={() => setOmensCardDetailId(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--muted)',
                  background: 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
