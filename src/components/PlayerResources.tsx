import { useState, useEffect } from 'react'
import { TERRAIN_COLORS, TERRAIN_LABELS } from '../game/terrain'
import type { PlayOmenTargets } from '../game/omens'
import { AnimatedResourceIcon } from './AnimatedResourceIcon'
import { BuildCostsInline, type BuildCostDebuffSources } from './BuildCostsLegend'
import type { Terrain } from '../game/types'

const RESOURCE_OPTIONS: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

const RESOURCE_TYPES: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

const OMEN_CARDS_WITH_CHOICE = ['foragers_bounty', 'skilled_prospector', 'gold_rush', 'sturdy_wagon_wheel', 'reliable_harvest'] as const

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
  /** Oregon's Omens: play a buff card from hand (optional targets e.g. Forager's Bounty: resourceChoice) */
  onPlayOmenCard?: (cardId: string, targets?: PlayOmenTargets) => void
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
  /** Oregon's Omens: hex options for Reliable Harvest (player's producing hexes: terrain + number). When provided and non-empty, player picks which hex gets +1 on next roll. */
  reliableHarvestHexOptions?: Array<{ hexId: string; label: string }>
  /** Oregon's Omens: Farm Swap — your producing hexes (terrain + number). */
  farmSwapMyHexOptions?: Array<{ hexId: string; label: string }>
  /** Oregon's Omens: Farm Swap — opponent hexes available to swap with (grouped by owning player via optional ownerId/ownerName). */
  farmSwapTargetHexOptions?: Array<{ hexId: string; label: string; ownerId?: number; ownerName?: string }>
  /** Oregon's Omens: number of cards drawn (in hands + discard) for "x/45 cards purchased" tally */
  omenCardsPurchased?: number
  /** Oregon's Omens: total deck size (45) for "x/45 cards purchased" tally */
  omenCardsTotal?: number
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
  reliableHarvestHexOptions = [],
  farmSwapMyHexOptions = [],
  farmSwapTargetHexOptions = [],
  omenCardsPurchased,
  omenCardsTotal,
}: PlayerResourcesProps) {
  const [omensCardDetailId, setOmensCardDetailId] = useState<string | null>(null)
  const [farmSwapMyHexId, setFarmSwapMyHexId] = useState<string | null>(null)
  const [farmSwapTargetHexId, setFarmSwapTargetHexId] = useState<string | null>(null)
  useEffect(() => {
    if (omensCardDetailId === 'farm_swap') {
      setFarmSwapMyHexId(null)
      setFarmSwapTargetHexId(null)
    }
  }, [omensCardDetailId])
  return (
    <div>
      <div className="player-resources-section-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
              padding: 10,
              borderRadius: 8,
              background: 'rgba(255,251,240,0.6)',
              border: '1px solid #D9BDA5',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 'bold', color: p.color, fontSize: 13 }}>{p.name}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2A1A0A' }}>{p.victoryPoints} VP</span>
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
                  <img src="/omen-card-icon.png" alt="" style={{ width: 14, height: 14, flexShrink: 0, imageRendering: 'pixelated' }} />
                  <span style={{ fontWeight: 500 }}>Omen</span>
                  <span style={{ fontWeight: 600, marginLeft: 2 }}>{p.omensHand?.length ?? 0}</span>
                </div>
              )}
            </div>
            {showControls && lastDice == null && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="roll-dice-btn"
                  onClick={onRollDice}
                  style={{ padding: '8px 16px', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(100,181,246,0.1)', border: '1px solid #94A3B8' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {lastDice != null && onEndTurn && !robberMode?.moving && !robberMode?.newHexId && (
                    <button
                      onClick={onEndTurn}
                      style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #D9BDA5', background: '#E8E0D5', color: '#2A1A0A', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                      End turn
                    </button>
                  )}
                  {(() => {
                    const roadDisabled = p.roadsLeft <= 0 || canBuildRoad === false
                    const settlementDisabled = p.settlementsLeft <= 0 || canBuildSettlement === false
                    const cityDisabled = p.citiesLeft <= 0 || canBuildCity === false
                    const activeBtn = { padding: '8px 14px', borderRadius: 8, border: '1px solid #A86A45', background: '#C17D5B', color: '#fff', cursor: 'pointer' as const, fontSize: 13, fontWeight: 600 }
                    const selectedBtn = { padding: '8px 14px', borderRadius: 8, border: '1px solid #4A7AB8', background: 'rgba(100,181,246,0.35)', color: '#2A1A0A', cursor: 'pointer' as const, fontSize: 13, fontWeight: 600 }
                    const disabledBtn = { padding: '8px 14px', borderRadius: 8, border: '1px solid #D9BDA5', background: '#E8E0D5', color: '#5C5348', cursor: 'not-allowed' as const, fontSize: 13, fontWeight: 600 }
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
                          style={roadDisabled ? disabledBtn : buildMode === 'road' ? selectedBtn : activeBtn}
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
                          style={settlementDisabled ? disabledBtn : buildMode === 'settlement' ? selectedBtn : activeBtn}
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
                          style={cityDisabled ? disabledBtn : buildMode === 'city' ? selectedBtn : activeBtn}
                        >City</button>
                        {oregonsOmensEnabled && (
                          <button
                            onClick={() => { if (canDrawOmenCard) onDrawOmenCard?.() }}
                            disabled={!canDrawOmenCard}
                            title="Cost: 1 Wheat, 1 Sheep, 1 Ore. Draw one Omen card (max 5 in hand)."
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
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
                            <img src="/omen-card-icon.png" alt="" style={{ width: 14, height: 14, imageRendering: 'pixelated' }} />
                            Draw Omen ({omensHandCount}/5)
                          </button>
                        )}
                      </>
                    )
                  })()}
                  {(() => {
                    const canAffordAnyTrade = getTradeRate && RESOURCE_OPTIONS.some((t) => (p.resources[t] || 0) >= getTradeRate(t as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'))
                    const tradeDisabled = !canAffordAnyTrade
                    return (
                      <button
                        disabled={tradeDisabled}
                        onClick={() => { if (!tradeDisabled) { onSetTradeFormOpen?.(!tradeFormOpen); onSetErrorMessage?.(null) } }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: tradeDisabled ? '1px solid #D9BDA5' : tradeFormOpen ? '1px solid #4A7AB8' : '1px solid #A86A45',
                          background: tradeDisabled ? '#E8E0D5' : tradeFormOpen ? 'rgba(100,181,246,0.35)' : '#C17D5B',
                          color: tradeDisabled ? '#5C5348' : '#fff',
                          cursor: tradeDisabled ? 'not-allowed' : 'pointer',
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >Trade (4:1)</button>
                    )
                  })()}
                </div>
                {tradeFormOpen && onSetTradeGive && onSetTradeGet && tradeGive && tradeGet && (() => {
                  const tradeRate = getTradeRate && tradeGive !== 'desert' ? getTradeRate(tradeGive as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') : 4
                  return (
                    <div style={{ padding: 12, borderRadius: 8, background: 'rgba(42,26,10,0.08)', border: '1px solid #D9BDA5' }}>
                      <div style={{ fontSize: 13, marginBottom: 8, color: '#2A1A0A', fontWeight: 500 }}>
                        Give {tradeRate} of one, get 1 of another:
                        {tradeRate < 4 && (
                          <span style={{ marginLeft: 6, color: '#B45309', fontSize: 11 }}>
                            (Harbor rate: {tradeRate}:1)
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ fontSize: 13, color: '#2A1A0A' }}>
                          Give {tradeRate}: <select value={tradeGive} onChange={e => onSetTradeGive(e.target.value as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore')} style={{ marginLeft: 4, padding: '6px 8px', borderRadius: 6, background: '#FFFBF0', color: '#2A1A0A', border: '1px solid #D9BDA5', fontSize: 12 }}>
                            {RESOURCE_OPTIONS.filter(t => t !== 'desert').map(t => <option key={t} value={t}>{TERRAIN_LABELS[t]} ({p.resources[t] || 0})</option>)}
                          </select>
                        </label>
                        <label style={{ fontSize: 13, color: '#2A1A0A' }}>
                          Get 1: <select value={tradeGet} onChange={e => onSetTradeGet(e.target.value as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore')} style={{ marginLeft: 4, padding: '6px 8px', borderRadius: 6, background: '#FFFBF0', color: '#2A1A0A', border: '1px solid #D9BDA5', fontSize: 12 }}>
                            {RESOURCE_OPTIONS.filter(t => t !== 'desert').map(t => <option key={t} value={t}>{TERRAIN_LABELS[t]}</option>)}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => { if ((p.resources[tradeGive] || 0) < tradeRate) { onSetErrorMessage?.(`Insufficient resources. Need ${tradeRate} ${TERRAIN_LABELS[tradeGive]} to trade.`) } else { onTrade?.(tradeGive as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', tradeGet as 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore') } }}
                          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#C17D5B', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
                        >Confirm</button>
                        <button
                          type="button"
                          onClick={() => onSetTradeFormOpen?.(false)}
                          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #D9BDA5', background: '#E8E0D5', color: '#2A1A0A', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                        >Cancel</button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
            {/* Oregon's Omens: active effects (current player) */}
            {oregonsOmensEnabled && isActive && phase === 'playing' && activeOmensEffects.length > 0 && getActiveEffectDescription && (
              <div style={{ marginTop: 8, padding: 6, borderRadius: 6, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 11, color: 'var(--text)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Active effects</div>
                <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc', color: 'var(--text)' }}>
                  {activeOmensEffects.map((eff, idx) => (
                    <li key={`${eff.cardId}-${idx}`} style={{ marginBottom: 2, color: 'var(--text)' }}>{getActiveEffectDescription(eff)}</li>
                  ))}
                </ul>
              </div>
            )}
            {/* Oregon's Omens: hand list (active player only) */}
            {oregonsOmensEnabled && isActive && phase === 'playing' && omensHand.length > 0 && (
              <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'rgba(139,69,19,0.15)', border: '1px solid rgba(139,69,19,0.4)', color: 'var(--text)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <img src="/omen-card-icon.png" alt="" style={{ width: 14, height: 14, imageRendering: 'pixelated' }} />
                  Omen cards
                </div>
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
            {/* Build costs inside player card: have/cost and red when insufficient; when Omens enabled, show effective cost and debuff asterisk + tooltip/modal. Shown in setup and playing. */}
            {(phase === 'setup' || phase === 'playing') && (
              <BuildCostsInline
                playerResources={p.resources}
                roadCost={phase === 'playing' && oregonsOmensEnabled && getEffectiveBuildCostForPlayer ? getEffectiveBuildCostForPlayer(p.id, 'road') : undefined}
                settlementCost={phase === 'playing' && oregonsOmensEnabled && getEffectiveBuildCostForPlayer ? getEffectiveBuildCostForPlayer(p.id, 'settlement') : undefined}
                cityCost={phase === 'playing' && oregonsOmensEnabled && getEffectiveBuildCostForPlayer ? getEffectiveBuildCostForPlayer(p.id, 'city') : undefined}
                debuffSources={phase === 'playing' && oregonsOmensEnabled && getBuildCostDebuffSourcesForPlayer ? getBuildCostDebuffSourcesForPlayer(p.id) : undefined}
                getOmenCardName={getOmenCardName}
                oregonsOmensEnabled={oregonsOmensEnabled}
                cardsPurchased={oregonsOmensEnabled ? omenCardsPurchased : undefined}
                totalOmenCards={oregonsOmensEnabled ? omenCardsTotal : undefined}
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
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setOmensCardDetailId(null)}
        >
          <div
            style={{
              background: '#FFFBF0',
              color: '#2A1A0A',
              borderRadius: 12,
              padding: 20,
              maxWidth: 320,
              width: '90%',
              boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(42,26,10,0.12)',
              border: '1px solid rgba(42,26,10,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 'bold', color: '#2A1A0A', marginBottom: 8 }}>
              {getOmenCardName(omensCardDetailId)}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(42,26,10,0.85)', marginBottom: 16, lineHeight: 1.4 }}>
              {getOmenCardEffectText(omensCardDetailId)}
            </div>
            {omensCardDetailId === 'foragers_bounty' && canPlayOmenCard?.(omensCardDetailId) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Choose resource:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      onPlayOmenCard?.('foragers_bounty', { resourceChoice: 'wood' })
                      setOmensCardDetailId(null)
                    }}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#C17D5B', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                  >
                    Gain 1 Wood
                  </button>
                  <button
                    onClick={() => {
                      onPlayOmenCard?.('foragers_bounty', { resourceChoice: 'wheat' })
                      setOmensCardDetailId(null)
                    }}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#C17D5B', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                  >
                    Gain 1 Wheat
                  </button>
                </div>
              </div>
            )}
            {omensCardDetailId === 'skilled_prospector' && canPlayOmenCard?.(omensCardDetailId) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'rgba(42,26,10,0.8)', marginBottom: 8 }}>Choose pair:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      onPlayOmenCard?.('skilled_prospector', { resourceChoices: ['ore', 'wood'] })
                      setOmensCardDetailId(null)
                    }}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#C17D5B', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                  >
                    Ore + Wood
                  </button>
                  <button
                    onClick={() => {
                      onPlayOmenCard?.('skilled_prospector', { resourceChoices: ['brick', 'wheat'] })
                      setOmensCardDetailId(null)
                    }}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#C17D5B', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                  >
                    Brick + Wheat
                  </button>
                </div>
              </div>
            )}
            {omensCardDetailId === 'gold_rush' && canPlayOmenCard?.(omensCardDetailId) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Choose 1 extra resource (you also get 3 Ore):</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {RESOURCE_OPTIONS.map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        onPlayOmenCard?.('gold_rush', { goldRushChoice: t })
                        setOmensCardDetailId(null)
                      }}
                      style={{ padding: '8px 14px', borderRadius: 8, background: '#C17D5B', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                    >
                      {TERRAIN_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {omensCardDetailId === 'sturdy_wagon_wheel' && canPlayOmenCard?.(omensCardDetailId) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'rgba(42,26,10,0.8)', marginBottom: 8 }}>Next road costs 1 less:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      onPlayOmenCard?.('sturdy_wagon_wheel', { roadDiscount: 'wood' })
                      setOmensCardDetailId(null)
                    }}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#C17D5B', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                  >
                    Wood
                  </button>
                  <button
                    onClick={() => {
                      onPlayOmenCard?.('sturdy_wagon_wheel', { roadDiscount: 'brick' })
                      setOmensCardDetailId(null)
                    }}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#C17D5B', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                  >
                    Brick
                  </button>
                </div>
              </div>
            )}
            {omensCardDetailId === 'reliable_harvest' && canPlayOmenCard?.(omensCardDetailId) && reliableHarvestHexOptions.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Choose hex for +1 on next roll:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {reliableHarvestHexOptions.map(({ hexId, label }) => (
                    <button
                      key={hexId}
                      onClick={() => {
                        onPlayOmenCard?.('reliable_harvest', { hexIdForHarvest: hexId })
                        setOmensCardDetailId(null)
                      }}
                      style={{ padding: '8px 14px', borderRadius: 8, background: '#C17D5B', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {omensCardDetailId === 'farm_swap' && canPlayOmenCard?.(omensCardDetailId) && farmSwapMyHexOptions.length > 0 && farmSwapTargetHexOptions.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'rgba(42,26,10,0.8)', marginBottom: 6 }}>Your hex to swap:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {farmSwapMyHexOptions.map(({ hexId, label }) => {
                    const isSelected = farmSwapMyHexId === hexId
                    return (
                      <button
                        key={hexId}
                        onClick={() => setFarmSwapMyHexId(hexId)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: isSelected ? '2px solid #C17D5B' : '1px solid rgba(42,26,10,0.35)',
                          background: isSelected ? '#C17D5B' : '#F5EEE2',
                          color: isSelected ? '#fff' : '#2A1A0A',
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 600,
                          boxShadow: isSelected ? '0 2px 4px rgba(0,0,0,0.18)' : 'none',
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(42,26,10,0.8)', marginBottom: 6 }}>Opponent hex to swap with:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(() => {
                    const grouped = new Map<string, typeof farmSwapTargetHexOptions>()
                    for (const opt of farmSwapTargetHexOptions) {
                      const ownerKey = opt.ownerName || (opt.ownerId != null ? `Player ${opt.ownerId}` : 'Other player(s)')
                      const existing = grouped.get(ownerKey)
                      if (existing) existing.push(opt)
                      else grouped.set(ownerKey, [opt])
                    }
                    return Array.from(grouped.entries()).map(([ownerLabel, options]) => (
                      <div key={ownerLabel}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(42,26,10,0.9)', marginBottom: 4 }}>
                          {ownerLabel}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {options.map(({ hexId, label }) => {
                            const isSelected = farmSwapTargetHexId === hexId
                            return (
                              <button
                                key={hexId}
                                onClick={() => setFarmSwapTargetHexId(hexId)}
                                style={{
                                  padding: '8px 14px',
                                  borderRadius: 8,
                                  border: isSelected ? '2px solid #C17D5B' : '1px solid rgba(42,26,10,0.35)',
                                  background: isSelected ? '#C17D5B' : '#F5EEE2',
                                  color: isSelected ? '#fff' : '#2A1A0A',
                                  cursor: 'pointer',
                                  fontSize: 13,
                                  fontWeight: 600,
                                  boxShadow: isSelected ? '0 2px 4px rgba(0,0,0,0.18)' : 'none',
                                }}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {omensCardDetailId === 'farm_swap' ? (
                <>
                  <button
                    onClick={() => {
                      if (farmSwapMyHexId && farmSwapTargetHexId) {
                        onPlayOmenCard?.('farm_swap', { farmSwapMyHexId, farmSwapTargetHexId })
                        setOmensCardDetailId(null)
                      }
                    }}
                    disabled={!farmSwapMyHexId || !farmSwapTargetHexId}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      background: farmSwapMyHexId && farmSwapTargetHexId ? '#C17D5B' : '#B0A99E',
                      border: 'none',
                      color: '#fff',
                      cursor: farmSwapMyHexId && farmSwapTargetHexId ? 'pointer' : 'not-allowed',
                      fontSize: 13,
                      fontWeight: 600,
                      opacity: farmSwapMyHexId && farmSwapTargetHexId ? 1 : 0.7,
                      boxShadow: farmSwapMyHexId && farmSwapTargetHexId ? '0 2px 6px rgba(0,0,0,0.2)' : 'none',
                    }}
                  >
                    Swap
                  </button>
                  <button
                    onClick={() => setOmensCardDetailId(null)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(42,26,10,0.35)',
                      background: '#E8E0D5',
                      color: '#2A1A0A',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {(!OMEN_CARDS_WITH_CHOICE.includes(omensCardDetailId as typeof OMEN_CARDS_WITH_CHOICE[number]) ||
                    (omensCardDetailId === 'reliable_harvest' && reliableHarvestHexOptions.length === 0)) && (
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
                        background: canPlayOmenCard?.(omensCardDetailId) ? '#C17D5B' : '#B0A99E',
                        border: 'none',
                        color: '#fff',
                        cursor: canPlayOmenCard?.(omensCardDetailId) ? 'pointer' : 'not-allowed',
                        fontSize: 13,
                        fontWeight: 600,
                        opacity: canPlayOmenCard?.(omensCardDetailId) ? 1 : 0.7,
                        boxShadow: canPlayOmenCard?.(omensCardDetailId) ? '0 2px 6px rgba(0,0,0,0.2)' : 'none',
                      }}
                    >
                      Play card
                    </button>
                  )}
                  <button
                    onClick={() => setOmensCardDetailId(null)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(42,26,10,0.35)',
                      background: '#E8E0D5',
                      color: '#2A1A0A',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
