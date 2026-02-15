import { useState } from 'react'
import { TERRAIN_COLORS, TERRAIN_LABELS } from '../game/terrain'
import { getBuildCost } from '../game/logic'
import { AnimatedResourceIcon } from './AnimatedResourceIcon'
import type { Terrain } from '../game/types'

// Match HexBoard: player colorImage -> road/city assets (so Resources module uses same game icons)
const COLOR_TO_ROAD_IMAGE: Record<string, string> = {
  '/player-teal.png': '/road-teal.png',
  '/player-pink.png': '/road-pink.png',
  '/player-purple.png': '/road-purple.png',
  '/player-green.png': '/road-green2.png',
  '/player-green2.png': '/road-green.png',
  '/player-white.png': '/road-white.png',
}
const COLOR_TO_CITY_IMAGE: Record<string, string> = {
  '/player-teal.png': '/city-teal.png',
  '/player-pink.png': '/city-pink.png',
  '/player-purple.png': '/city-purple.png',
  '/player-green.png': '/city-green2.png',
  '/player-green2.png': '/city-green.png',
  '/player-white.png': '/city-white.png',
}
const DEFAULT_COLOR_IMAGE = '/player-teal.png'

function TerrainIcon({ type, size = 12 }: { type: Terrain; size?: number }) {
  const style = { width: size, height: size, flexShrink: 0, imageRendering: 'pixelated' as const }
  if (type === 'wheat') return <AnimatedResourceIcon image1="/wheat-icon.png" image2="/wheat-icon.png" alt="Wheat" size={size} />
  if (type === 'wood') return <img src="/wood-icon.png" alt="Wood" style={style} />
  if (type === 'ore') return <img src="/ore-icon.png" alt="Ore" style={style} />
  if (type === 'sheep') return <img src="/sheep-icon.png" alt="Sheep" style={style} />
  if (type === 'brick') return <img src="/brick-icon.png" alt="Brick" style={style} />
  return <span style={{ width: size, height: size, borderRadius: '50%', background: TERRAIN_COLORS[type] }} />
}

/** Single cost line: icon + "have/cost Label", red when have < cost. Optional asterisk + hover/tap for debuff source. */
function CostLine({
  type,
  have,
  cost,
  debuffCardNames,
  onDebuffClick,
}: {
  type: Terrain
  have: number
  cost: number
  debuffCardNames?: string[]
  onDebuffClick?: (message: string) => void
}) {
  const insufficient = have < cost
  const hasDebuff = debuffCardNames != null && debuffCardNames.length > 0
  const tooltipText = hasDebuff ? `Increased by: ${debuffCardNames.join(', ')}` : undefined
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        color: insufficient ? '#f87171' : 'var(--text)',
        ...(hasDebuff ? { cursor: 'help' as const } : {}),
      }}
      title={tooltipText}
      onClick={hasDebuff && onDebuffClick ? () => onDebuffClick(tooltipText!) : undefined}
      role={hasDebuff && onDebuffClick ? 'button' : undefined}
    >
      <TerrainIcon type={type} size={12} />
      <span>{have}/{cost} {TERRAIN_LABELS[type]}{hasDebuff ? '*' : ''}</span>
    </span>
  )
}

/** Structure icon for Road / Settlement / City. When colorImage provided, uses that player's game assets. */
function StructureIcon({ type, colorImage }: { type: 'road' | 'settlement' | 'city'; colorImage?: string }) {
  const playerImage = colorImage ?? DEFAULT_COLOR_IMAGE
  const roadImage = COLOR_TO_ROAD_IMAGE[playerImage] ?? COLOR_TO_ROAD_IMAGE[DEFAULT_COLOR_IMAGE]
  const cityImage = COLOR_TO_CITY_IMAGE[playerImage] ?? COLOR_TO_CITY_IMAGE[DEFAULT_COLOR_IMAGE]

  if (type === 'road') {
    return (
      <img
        src={roadImage}
        alt=""
        style={{ width: 20, height: 20, objectFit: 'contain', imageRendering: 'pixelated' }}
        title="Road"
      />
    )
  }
  if (type === 'settlement') {
    return (
      <img
        src={playerImage}
        alt=""
        style={{ width: 20, height: 20, objectFit: 'contain', imageRendering: 'pixelated' }}
        title="Settlement"
      />
    )
  }
  return (
    <img
      src={cityImage}
      alt=""
      style={{ width: 24, height: 24, objectFit: 'contain', imageRendering: 'pixelated' }}
      title="City"
    />
  )
}

interface BuildCostsLegendProps {
  /** When provided, costs show have/cost and insufficient resources in red */
  playerResources?: Record<Terrain, number>
}

export function BuildCostsLegend({ playerResources }: BuildCostsLegendProps) {
  const roadCost = getBuildCost('road')
  const settlementCost = getBuildCost('settlement')
  const cityCost = getBuildCost('city')

  const renderCostRow = (cost: Partial<Record<Terrain, number>>, res: Record<Terrain, number> | undefined) => {
    const entries = Object.entries(cost) as [Terrain, number][]
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {entries.map(([terrain, need]) => {
          const have = res ? (res[terrain] ?? 0) : need
          return <CostLine key={terrain} type={terrain} have={have} cost={need} />
        })}
      </div>
    )
  }

  return (
    <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Build Costs
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            <StructureIcon type="road" />
            <span>Road</span>
          </div>
          {renderCostRow(roadCost, playerResources)}
        </div>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            <StructureIcon type="settlement" />
            <span>Settlement</span>
          </div>
          {renderCostRow(settlementCost, playerResources)}
        </div>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            <StructureIcon type="city" />
            <span>City</span>
          </div>
          {renderCostRow(cityCost, playerResources)}
        </div>
      </div>
    </div>
  )
}

/** Debuff sources per structure: for each terrain, list of card IDs that increase cost. */
export type BuildCostDebuffSources = {
  road: Partial<Record<Terrain, string[]>>
  settlement: Partial<Record<Terrain, string[]>>
  city: Partial<Record<Terrain, string[]>>
}

const OMEN_DRAW_COST: Partial<Record<Terrain, number>> = { wheat: 1, sheep: 1, ore: 1 }

/** Inline build costs for use inside a player card. When effective costs / debuffSources provided (Oregon's Omens), shows adjusted cost and asterisk + tooltip/modal for debuffed resources. */
export function BuildCostsInline({
  playerResources,
  roadCost: roadCostProp,
  settlementCost: settlementCostProp,
  cityCost: cityCostProp,
  debuffSources,
  getOmenCardName = (id: string) => id.replace(/_/g, ' '),
  oregonsOmensEnabled,
  cardsPurchased,
  totalOmenCards,
  /** When provided, Road / Settlement / City icons use this player's game assets (matches board). */
  playerColorImage,
}: {
  playerResources: Record<Terrain, number>
  roadCost?: Partial<Record<Terrain, number>>
  settlementCost?: Partial<Record<Terrain, number>>
  cityCost?: Partial<Record<Terrain, number>>
  debuffSources?: BuildCostDebuffSources
  getOmenCardName?: (cardId: string) => string
  /** When true, show Omen card draw cost row and x/total cards purchased tally */
  oregonsOmensEnabled?: boolean
  cardsPurchased?: number
  totalOmenCards?: number
  /** Player's color image path (e.g. /player-teal.png) so structure icons match player color */
  playerColorImage?: string
}) {
  const baseRoad = getBuildCost('road')
  const baseSettlement = getBuildCost('settlement')
  const baseCity = getBuildCost('city')
  const roadCost = roadCostProp ?? baseRoad
  const settlementCost = settlementCostProp ?? baseSettlement
  const cityCost = cityCostProp ?? baseCity

  const [debuffModalMessage, setDebuffModalMessage] = useState<string | null>(null)

  const rowStyle = { display: 'flex' as const, flexWrap: 'wrap' as const, gap: 8, alignItems: 'center' }
  const sectionStyle = { marginBottom: 10 }
  const titleStyle = { display: 'inline-flex' as const, alignItems: 'center' as const, gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }

  const CostRow = ({
    cost,
    debuffMap,
  }: {
    cost: Partial<Record<Terrain, number>>
    debuffMap?: Partial<Record<Terrain, string[]>>
  }) => (
    <div style={rowStyle}>
      {(Object.entries(cost) as [Terrain, number][]).map(([terrain, need]) => {
        const have = playerResources[terrain] ?? 0
        const cardIds = debuffMap?.[terrain]
        const debuffCardNames = cardIds?.map(getOmenCardName)
        return (
          <CostLine
            key={terrain}
            type={terrain}
            have={have}
            cost={need}
            debuffCardNames={debuffCardNames}
            onDebuffClick={setDebuffModalMessage}
          />
        )
      })}
    </div>
  )

  return (
    <div style={{ marginTop: 10 }}>
      <div style={sectionStyle}>
        <div style={titleStyle}>
          <StructureIcon type="road" colorImage={playerColorImage} />
          <span>Road</span>
        </div>
        <CostRow cost={roadCost} debuffMap={debuffSources?.road} />
      </div>
      <div style={sectionStyle}>
        <div style={titleStyle}>
          <StructureIcon type="settlement" colorImage={playerColorImage} />
          <span>Settlement</span>
        </div>
        <CostRow cost={settlementCost} debuffMap={debuffSources?.settlement} />
      </div>
      <div style={sectionStyle}>
        <div style={titleStyle}>
          <StructureIcon type="city" colorImage={playerColorImage} />
          <span>City</span>
        </div>
        <CostRow cost={cityCost} debuffMap={debuffSources?.city} />
      </div>
      {oregonsOmensEnabled && (
        <>
          <div style={sectionStyle}>
            <div style={titleStyle}>
              <img
                src="/omen-card-icon.png"
                alt=""
                style={{ width: 20, height: 28, objectFit: 'contain', flexShrink: 0, imageRendering: 'pixelated' }}
                title="Omen card"
              />
              <span>Omen card</span>
            </div>
            <CostRow cost={OMEN_DRAW_COST} />
          </div>
          {cardsPurchased != null && totalOmenCards != null && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {cardsPurchased}/{totalOmenCards} cards purchased
            </div>
          )}
        </>
      )}
      {debuffModalMessage && (
        <div
          role="dialog"
          aria-label="Cost increase source"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
          onClick={() => setDebuffModalMessage(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 16,
              maxWidth: 320,
              margin: 16,
              border: '1px solid var(--muted)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Increased by:</div>
            <div style={{ fontSize: 14, color: 'var(--text)' }}>{debuffModalMessage}</div>
            <button
              onClick={() => setDebuffModalMessage(null)}
              style={{
                marginTop: 12,
                padding: '8px 16px',
                borderRadius: 8,
                background: 'var(--accent)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
