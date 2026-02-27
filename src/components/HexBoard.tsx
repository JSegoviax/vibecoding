import { useMemo, useState, useEffect } from 'react'
import { hexToPixel, hexCorner, HEX_R, getWaterHexPositions } from '../game/board'
import { buildTopology } from '../game/topology'
import { TERRAIN_COLORS } from '../game/terrain'
import type { Hex, Harbor, Terrain } from '../game/types'

// Map player color image to matching potential settlement spot image (by color family)
const COLOR_TO_SPOT_IMAGE: Record<string, string> = {
  '/player-teal.png': '/settlement-spot-blue.png',
  '/player-green.png': '/settlement-spot-green.png',
  '/player-green2.png': '/settlement-spot-bush.png',
  '/player-pink.png': '/settlement-spot-magenta.png',
  '/player-purple.png': '/settlement-spot-purple.png',
  '/player-white.png': '/settlement-spot-gray.png',
}
const DEFAULT_SPOT_IMAGE = '/settlement-spot-gray.png'

// Map player color image to city-upgrade indicator image (by color: teal, pink, purple, green, cyan, white)
const COLOR_TO_CITY_INDICATOR: Record<string, number> = {
  '/player-teal.png': 4,   // teal/cyan indicator (asset 4)
  '/player-pink.png': 1,
  '/player-purple.png': 2,
  '/player-green.png': 3,
  '/player-green2.png': 0, // dark green indicator (asset 0)
  '/player-white.png': 5,
}
const DEFAULT_CITY_INDICATOR = 5

// Map player color image to road segment image (by color). One road asset per road; width preserved.
const COLOR_TO_ROAD_IMAGE: Record<string, string> = {
  '/player-teal.png': '/road-teal.png',
  '/player-pink.png': '/road-pink.png',
  '/player-purple.png': '/road-purple.png',
  '/player-green.png': '/road-green2.png',   // Light green player
  '/player-green2.png': '/road-green.png',   // Dark green player
  '/player-white.png': '/road-white.png',
}
/** Road asset display size - preserve width and height (no scaling) */
const ROAD_ASSET_WIDTH = 16
const ROAD_ASSET_HEIGHT = 64

/** Map player color to road-build animation folder and file prefix (frames 00–09) */
const COLOR_TO_ROAD_BUILD: Record<string, { folder: string; prefix: string }> = {
  '/player-teal.png': { folder: 'teal', prefix: 'road_teal' },
  '/player-green.png': { folder: 'green', prefix: 'road_green' },
  '/player-green2.png': { folder: 'dk_green2', prefix: 'road_dk_green' },
  '/player-pink.png': { folder: 'pink', prefix: 'road_pink' },
  '/player-purple.png': { folder: 'purple', prefix: 'road_purple' },
  '/player-white.png': { folder: 'white', prefix: 'road_white' },
}
const PLACEABLE_ROAD_FRAME_MS = 110

/** Number token assets (2–12): 10% smaller than 78×66 (70×59). */
const NUMBER_TOKEN_WIDTH = 70
const NUMBER_TOKEN_HEIGHT = 59

/** Water hex: use intrinsic image dimensions to avoid stretching. Loaded at runtime. */

/** Robber token (raccoon) on the robber hex. Display size to fit in hex center. */
const ROBBER_IMAGE_WIDTH = 62
const ROBBER_IMAGE_HEIGHT = 46

// Map player color image to city icon (built cities use these instead of the settlement/house image)
const COLOR_TO_CITY_IMAGE: Record<string, string> = {
  '/player-teal.png': '/city-teal.png',
  '/player-pink.png': '/city-pink.png',
  '/player-purple.png': '/city-purple.png',
  '/player-green.png': '/city-green2.png',   // Green (lighter) -> city-green2 asset
  '/player-green2.png': '/city-green.png',    // Forest Green (dark) -> city-green asset
  '/player-white.png': '/city-white.png',
}

interface HexBoardProps {
  hexes: Hex[]
  vertexStates?: Record<string, { player: number; type: 'settlement' | 'city' }>
  edgeStates?: Record<string, number>
  selectVertex?: (id: string) => void
  selectEdge?: (id: string) => void
  highlightedVertices?: Set<string>
  highlightedEdges?: Set<string>
  robberHexId?: string | null
  selectableRobberHexes?: Set<string>
  selectHex?: (hexId: string) => void
  harbors?: Harbor[]
  players?: Array<{ colorImage: string; color: string }>
  activePlayerIndex?: number
  /** Hex IDs that produced resources on the last roll (highlight until next roll) */
  resourceHighlightHexIds?: Set<string>
  /** Hex IDs that would have produced but were blocked by the robber (red highlight) */
  robberBlockedHexIds?: Set<string>
  /** Oregon Capitalist: hex IDs that are hidden/fogged (show silhouette + optional cost) */
  hiddenHexIds?: Set<string>
  /** Oregon Capitalist: unlock cost to display on fogged hexes */
  hiddenHexCosts?: Record<string, string>
  /** When false, hide number tokens (2-12) on hexes. Default true for Catan-style games. */
  showNumberTokens?: boolean
  /** When 'setup', potential settlement spot icons pulse to highlight placeable vertices. */
  phase?: 'setup' | 'playing'
  /** When true, potential settlement spot icons pulse (e.g. during setup or when buying a settlement). */
  pulsePlaceableSpots?: boolean
  /** Vertex IDs where the current player can upgrade a settlement to a city (show indicator when Cities selected and can afford). */
  upgradableToCityVertices?: Set<string>
}

export function HexBoard({
  hexes,
  vertexStates = {},
  edgeStates = {},
  selectVertex,
  selectEdge,
  highlightedVertices,
  highlightedEdges,
  robberHexId,
  selectableRobberHexes,
  selectHex,
  harbors = [],
  players = [],
  activePlayerIndex = 0,
  resourceHighlightHexIds,
  robberBlockedHexIds,
  hiddenHexIds,
  hiddenHexCosts,
  showNumberTokens = true,
  phase,
  pulsePlaceableSpots,
  upgradableToCityVertices,
}: HexBoardProps) {
  const { vertices, edges } = useMemo(() => buildTopology(hexes), [hexes])
  const vById = useMemo(() => Object.fromEntries(vertices.map(v => [v.id, v])), [vertices])
  const eById = useMemo(() => Object.fromEntries(edges.map(e => [e.id, e])), [edges])

  // Placeable road build animation: cycle 00→09 and repeat while any placeable road is shown
  const [placeableRoadFrame, setPlaceableRoadFrame] = useState(0)
  const hasPlaceableRoads = highlightedEdges && edges.some(e => highlightedEdges.has(e.id) && !edgeStates?.[e.id])
  useEffect(() => {
    if (!hasPlaceableRoads) return
    const t = setInterval(() => {
      setPlaceableRoadFrame(f => (f + 1) % 10)
    }, PLACEABLE_ROAD_FRAME_MS)
    return () => clearInterval(t)
  }, [hasPlaceableRoads])

  const waterPositions = useMemo(() => getWaterHexPositions(), [])

  // Load water hex image and use intrinsic dimensions (avoids stretching)
  const [waterHexSize, setWaterHexSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    const img = new Image()
    img.onload = () => setWaterHexSize({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = '/water-hex.png'
  }, [])

  // Calculate actual bounds including both land and water hexes
  const bounds = useMemo(() => {
    const allHexes = [
      ...hexes.map(h => hexToPixel(h.q, h.r)),
      ...waterPositions.map(([q, r]) => hexToPixel(q, r))
    ]
    const xs = allHexes.flatMap(c => [c.x - HEX_R, c.x + HEX_R])
    const ys = allHexes.flatMap(c => [c.y - HEX_R, c.y + HEX_R])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return { minX, maxX, minY, maxY }
  }, [hexes, waterPositions])

  const cx = useMemo(() => (bounds.minX + bounds.maxX) / 2, [bounds])
  const cy = useMemo(() => (bounds.minY + bounds.maxY) / 2, [bounds])
  
  // Padding around board (minimal so map uses more of the viewport, especially on mobile)
  const padding = HEX_R * 0.12
  const w = useMemo(() => (bounds.maxX - bounds.minX) + padding * 2, [bounds, padding])
  const h = useMemo(() => (bounds.maxY - bounds.minY) + padding * 2, [bounds, padding])

  const PLAYER_COLORS: Record<number, string> = {
    1: '#e53935',
    2: '#1e88e5',
    3: '#43a047',
    4: '#fb8c00',
  }

  // Helper function to get player color
  const getPlayerColor = (playerId: number): string => {
    const player = players[playerId - 1]
    return player?.color || PLAYER_COLORS[playerId] || '#888'
  }

  return (
    <svg
      viewBox={`${bounds.minX - padding} ${bounds.minY - padding} ${w} ${h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{
        maxHeight: '90vh',
        minHeight: 500,
        width: '100%',
        position: 'relative',
        zIndex: 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <defs>
        <filter id="hex-number-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx={0} dy={1} stdDeviation={2} floodColor="#000" floodOpacity={0.5} />
        </filter>
      </defs>
      {/* Define clip paths for hexes */}
      <defs>
        {hexes.map(h => {
          const center = hexToPixel(h.q, h.r)
          const pts = [0, 1, 2, 3, 4, 5].map(i => hexCorner(center, i))
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
          return (
            <clipPath key={`clip-${h.id}`} id={`hex-clip-${h.id}`}>
              <path d={d} />
            </clipPath>
          )
        })}
      </defs>
      {/* Water hex ring (behind land) */}
      <defs>
        {waterPositions.map(([q, r]) => {
          const center = hexToPixel(q, r)
          const pts = [0, 1, 2, 3, 4, 5].map(i => hexCorner(center, i))
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
          return (
            <clipPath key={`water-clip-${q},${r}`} id={`water-clip-${q},${r}`}>
              <path d={d} />
            </clipPath>
          )
        })}
      </defs>
      {waterPositions.map(([q, r]) => {
        const center = hexToPixel(q, r)
        const pts = [0, 1, 2, 3, 4, 5].map(i => hexCorner(center, i))
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
        const w = waterHexSize?.width ?? 261
        const h = waterHexSize?.height ?? 304
        return (
          <g key={`w${q},${r}`}>
            <g clipPath={`url(#water-clip-${q},${r})`}>
              <image
                href="/water-hex.png"
                x={center.x - w / 2}
                y={center.y - h / 2}
                width={w}
                height={h}
                preserveAspectRatio="xMidYMid meet"
                style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
              />
            </g>
            <path
              d={d}
              fill="none"
              stroke="#152a47"
              strokeWidth={4}
            />
          </g>
        )
      })}

      {/* Land hexes */}
      {hexes.map(h => {
        const center = hexToPixel(h.q, h.r)
        const pts = [0, 1, 2, 3, 4, 5].map(i => hexCorner(center, i))
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
        const fill = (h.terrain && TERRAIN_COLORS[h.terrain as Terrain]) ?? '#6b6b6b'
        const isRobberHex = h.id === robberHexId
        const isSelectable = selectableRobberHexes?.has(h.id)
        const isHidden = hiddenHexIds?.has(h.id)
        const costLabel = hiddenHexCosts?.[h.id]

        if (isHidden) {
          return (
            <g key={h.id}>
              <path
                d={d}
                fill="#2a2a2a"
                fillOpacity={0.9}
                stroke="#4a4a4a"
                strokeWidth={5}
              />
              {costLabel && (
                <text
                  x={center.x}
                  y={center.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#999"
                  fontSize={14}
                  style={{ pointerEvents: 'none' }}
                >
                  {costLabel}
                </text>
              )}
            </g>
          )
        }

        return (
          <g key={h.id} data-board-interactive={selectHex && (isSelectable || isRobberHex) ? '' : undefined}>
            <path
              d={d}
              fill={fill}
              stroke={isSelectable ? '#64b5f6' : isRobberHex ? '#b91c1c' : '#6b5b4b'}
              strokeWidth={isSelectable || isRobberHex ? 7 : 5}
              onClick={() => selectHex?.(h.id)}
              style={{ cursor: selectHex && isSelectable ? 'pointer' : 'default' }}
            />
            {h.terrain === 'wood' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/wood-hex.png"
                  x={center.x - HEX_R}
                  y={center.y - HEX_R}
                  width={HEX_R * 2}
                  height={HEX_R * 2}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.terrain === 'brick' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/brick-hex.png"
                  x={center.x - HEX_R}
                  y={center.y - HEX_R}
                  width={HEX_R * 2}
                  height={HEX_R * 2}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.terrain === 'wheat' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/wheat-hex.png"
                  x={center.x - HEX_R}
                  y={center.y - HEX_R}
                  width={HEX_R * 2}
                  height={HEX_R * 2}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.terrain === 'ore' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/ore-hex.png"
                  x={center.x - HEX_R}
                  y={center.y - HEX_R}
                  width={HEX_R * 2}
                  height={HEX_R * 2}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.terrain === 'sheep' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/sheep-hex.png"
                  x={center.x - HEX_R}
                  y={center.y - HEX_R}
                  width={HEX_R * 2}
                  height={HEX_R * 2}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.terrain === 'desert' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/desert-hex.png"
                  x={center.x - HEX_R}
                  y={center.y - HEX_R}
                  width={HEX_R * 2}
                  height={HEX_R * 2}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {showNumberTokens && h.number != null && (
              <image
                href={`/number-tokens/${h.number}.png`}
                x={center.x - NUMBER_TOKEN_WIDTH / 2}
                y={center.y - NUMBER_TOKEN_HEIGHT / 2}
                width={NUMBER_TOKEN_WIDTH}
                height={NUMBER_TOKEN_HEIGHT}
                preserveAspectRatio="xMidYMid meet"
                style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
              />
            )}
            {isRobberHex && (
              <image
                href="/robber.png"
                x={center.x - ROBBER_IMAGE_WIDTH / 2}
                y={center.y - ROBBER_IMAGE_HEIGHT / 2}
                width={ROBBER_IMAGE_WIDTH}
                height={ROBBER_IMAGE_HEIGHT}
                preserveAspectRatio="xMidYMid meet"
                style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
              />
            )}
          </g>
        )
      })}

      {/* Resource highlight — drawn on top of all hexes so the full border is visible */}
      {resourceHighlightHexIds &&
        hexes
          .filter(h => resourceHighlightHexIds.has(h.id))
          .map(h => {
            const center = hexToPixel(h.q, h.r)
            const pts = [0, 1, 2, 3, 4, 5].map(i => hexCorner(center, i))
            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
            return (
              <path
                key={`resource-highlight-${h.id}`}
                className="resource-highlight-pulse"
                d={d}
                fill="none"
                stroke="#fbbf24"
                strokeWidth={6}
                style={{ pointerEvents: 'none' }}
              />
            )
          })}
      {/* Robber-blocked highlight — hex would have produced but didn’t because of the robber */}
      {robberBlockedHexIds &&
        hexes
          .filter(h => robberBlockedHexIds.has(h.id))
          .map(h => {
            const center = hexToPixel(h.q, h.r)
            const pts = [0, 1, 2, 3, 4, 5].map(i => hexCorner(center, i))
            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
            return (
              <path
                key={`robber-blocked-${h.id}`}
                className="resource-highlight-pulse"
                d={d}
                fill="none"
                stroke="#dc2626"
                strokeWidth={6}
                style={{ pointerEvents: 'none' }}
              />
            )
          })}

      {/* Edges (roads) */}
      {edges.map(e => {
        const v1 = vById[e.v1]
        const v2 = vById[e.v2]
        if (!v1 || !v2) return null
        const pid = edgeStates[e.id]
        const hl = highlightedEdges?.has(e.id)
        const dx = v2.x - v1.x
        const dy = v2.y - v1.y
        const len = Math.hypot(dx, dy) || 1
        const midX = (v1.x + v2.x) / 2
        const midY = (v1.y + v2.y) / 2
        const player = pid ? players[pid - 1] : null
        const roadImage = player?.colorImage ? COLOR_TO_ROAD_IMAGE[player.colorImage] : null
        if (pid && roadImage) {
          const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90
          return (
            <g
              key={e.id}
              transform={`translate(${midX}, ${midY}) rotate(${angleDeg})`}
              onClick={() => selectEdge?.(e.id)}
              style={{ cursor: selectEdge ? 'pointer' : 'default' }}
            >
              <image
                href={roadImage}
                x={-ROAD_ASSET_WIDTH / 2}
                y={-len / 2}
                width={ROAD_ASSET_WIDTH}
                height={len}
                preserveAspectRatio="none"
                style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
              />
              <rect
                x={-ROAD_ASSET_WIDTH / 2}
                y={-len / 2}
                width={ROAD_ASSET_WIDTH}
                height={len}
                fill="transparent"
                style={{ pointerEvents: 'auto' }}
              />
            </g>
          )
        }
        if (hl && !pid) {
          const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90
          const activePlayerId = activePlayerIndex + 1
          // Animation starts at the vertex connected to the player's settlement or existing road; builds away.
          const hasStructureAtV1 = vertexStates[e.v1]?.player === activePlayerId
          const hasStructureAtV2 = vertexStates[e.v2]?.player === activePlayerId
          const hasRoadAtV1 = edges.some(
            (ed) => ed.id !== e.id && edgeStates[ed.id] === activePlayerId && (ed.v1 === e.v1 || ed.v2 === e.v1)
          )
          const hasRoadAtV2 = edges.some(
            (ed) => ed.id !== e.id && edgeStates[ed.id] === activePlayerId && (ed.v1 === e.v2 || ed.v2 === e.v2)
          )
          const connectedAtV1 = hasStructureAtV1 || hasRoadAtV1
          const connectedAtV2 = hasStructureAtV2 || hasRoadAtV2
          const startAtMinus = connectedAtV1 || !connectedAtV2
          const activePlayer = players[activePlayerIndex]
          const buildInfo = activePlayer?.colorImage ? COLOR_TO_ROAD_BUILD[activePlayer.colorImage] : COLOR_TO_ROAD_BUILD['/player-teal.png']
          const { folder, prefix } = buildInfo ?? { folder: 'teal', prefix: 'road_teal' }
          // Each frame (00–09) is drawn to span the full edge; assets are designed to extend vertex-to-vertex.
          const frameStr = String(placeableRoadFrame).padStart(2, '0')
          const placeableRoadSrc = `/road-build/${folder}/${prefix}${frameStr}.png`
          const clipId = `clip-placeable-road-${e.id}`
          // Center animation on the edge line (vertex-to-vertex); nudge if asset content is off-center.
          const placeableRoadOffsetX = 0
          const imgX = -ROAD_ASSET_WIDTH / 2 + placeableRoadOffsetX
          return (
            <g
              key={e.id}
              transform={`translate(${midX}, ${midY}) rotate(${angleDeg})`}
              clipPath={`url(#${clipId})`}
              data-board-interactive={selectEdge ? '' : undefined}
              onClick={() => selectEdge?.(e.id)}
              style={{ cursor: selectEdge ? 'pointer' : 'default' }}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect x={-ROAD_ASSET_WIDTH / 2} y={-len / 2} width={ROAD_ASSET_WIDTH} height={len} />
                </clipPath>
              </defs>
              {/* Flip so road builds away from connected vertex (settlement or player's road) */}
              {startAtMinus ? (
                <g transform="scale(1, -1)">
                  <image
                    href={placeableRoadSrc}
                    x={imgX}
                    y={-len / 2}
                    width={ROAD_ASSET_WIDTH}
                    height={len}
                    preserveAspectRatio="none"
                    style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                  />
                </g>
              ) : (
                <image
                  href={placeableRoadSrc}
                  x={imgX}
                  y={-len / 2}
                  width={ROAD_ASSET_WIDTH}
                  height={len}
                  preserveAspectRatio="none"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              )}
              <rect
                x={-ROAD_ASSET_WIDTH / 2}
                y={-len / 2}
                width={ROAD_ASSET_WIDTH}
                height={len}
                fill="transparent"
                style={{ pointerEvents: 'auto' }}
              />
            </g>
          )
        }
        return (
          <line
            key={e.id}
            x1={v1.x}
            y1={v1.y}
            x2={v2.x}
            y2={v2.y}
            stroke={pid ? getPlayerColor(pid) : 'transparent'}
            strokeWidth={pid ? ROAD_ASSET_WIDTH : 0}
            strokeLinecap="round"
            onClick={() => selectEdge?.(e.id)}
            style={{ cursor: selectEdge ? 'pointer' : 'default' }}
          />
        )
      })}

      {/* Harbors (piers + circle) - render before vertices so piers sit behind settlements */}
      {harbors.map((harbor: Harbor) => {
        const edge = eById[harbor.edgeId]
        if (!edge) {
          console.warn('Harbor edge not found:', harbor.edgeId)
          return null
        }
        const v1 = vById[edge.v1]
        const v2 = vById[edge.v2]
        if (!v1 || !v2) {
          console.warn('Harbor vertices not found:', edge.v1, edge.v2)
          return null
        }
        
        // Circle at center of water hex; piers point diagonally from v1 and v2 toward the circle
        const midX = (v1.x + v2.x) / 2
        const midY = (v1.y + v2.y) / 2
        
        // Perpendicular to edge pointing outward (toward water)
        const dx = v2.x - v1.x
        const dy = v2.y - v1.y
        const perpX1 = -dy
        const perpY1 = dx
        const perpX2 = dy
        const perpY2 = -dx
        const centerToMidX = midX - cx
        const centerToMidY = midY - cy
        const dot1 = perpX1 * centerToMidX + perpY1 * centerToMidY
        const dot2 = perpX2 * centerToMidX + perpY2 * centerToMidY
        const perpX = dot1 > dot2 ? perpX1 : perpX2
        const perpY = dot1 > dot2 ? perpY1 : perpY2
        const len = Math.sqrt(perpX * perpX + perpY * perpY)
        const normX = len > 0 ? perpX / len : 0
        const normY = len > 0 ? perpY / len : 0
        
        // Badge at center of water hex (apothem = HEX_R * sqrt(3)/2 from edge mid)
        const waterHexCenterOffset = HEX_R * (Math.sqrt(3) / 2)
        const harborX = midX + waterHexCenterOffset * normX
        const harborY = midY + waterHexCenterOffset * normY
        
        // Piers: start on land (at vertex), extend out toward the circle
        const dockW = 58
        const dockH = 24
        
        const v1ToCircleX = harborX - v1.x
        const v1ToCircleY = harborY - v1.y
        const v2ToCircleX = harborX - v2.x
        const v2ToCircleY = harborY - v2.y
        
        const len1 = Math.hypot(v1ToCircleX, v1ToCircleY) || 1
        const len2 = Math.hypot(v2ToCircleX, v2ToCircleY) || 1
        const u1x = v1ToCircleX / len1
        const u1y = v1ToCircleY / len1
        const u2x = v2ToCircleX / len2
        const u2y = v2ToCircleY / len2
        
        // Pier center: offset toward land so the pier sits on the coast (pull back from water)
        const halfW = dockW / 2
        const pullBack = 0.28 // center closer to vertex so pier overlaps land more
        const oceanOffset = 2 // nudge piers 2px toward ocean
        const offset = halfW * pullBack + oceanOffset
        const dock1CenterX = v1.x + offset * u1x
        const dock1CenterY = v1.y + offset * u1y
        const dock2CenterX = v2.x + offset * u2x
        const dock2CenterY = v2.y + offset * u2y
        
        const angleDeg1 = (Math.atan2(v1ToCircleY, v1ToCircleX) * 180) / Math.PI
        const angleDeg2 = (Math.atan2(v2ToCircleY, v2ToCircleX) * 180) / Math.PI
        // Flip pier image when pointing left/west so the top surface looks right-side up
        const flip1 = u1x < 0 ? ' scale(1,-1)' : ''
        const flip2 = u2x < 0 ? ' scale(1,-1)' : ''
        
        return (
          <g key={harbor.id} style={{ zIndex: 100 }}>
            {/* Pier 1: from first vertex, diagonal toward circle */}
            <g
              transform={`translate(${dock1CenterX}, ${dock1CenterY}) rotate(${angleDeg1})${flip1}`}
              style={{ pointerEvents: 'none' }}
            >
              <image
                href="/port-dock.png"
                x={-dockW / 2}
                y={-dockH / 2}
                width={dockW}
                height={dockH}
                preserveAspectRatio="xMidYMid meet"
                style={{ imageRendering: 'auto' }}
              />
            </g>
            {/* Pier 2: from second vertex, diagonal toward circle */}
            <g
              transform={`translate(${dock2CenterX}, ${dock2CenterY}) rotate(${angleDeg2})${flip2}`}
              style={{ pointerEvents: 'none' }}
            >
              <image
                href="/port-dock.png"
                x={-dockW / 2}
                y={-dockH / 2}
                width={dockW}
                height={dockH}
                preserveAspectRatio="xMidYMid meet"
                style={{ imageRendering: 'auto' }}
              />
            </g>
            {/* Harbor icon (ship) fills the water hex */}
            <image
              href="/harbor-ship.png"
              x={harborX - HEX_R}
              y={harborY - HEX_R}
              width={HEX_R * 2}
              height={HEX_R * 2}
              preserveAspectRatio="xMidYMid meet"
              style={{ pointerEvents: 'none', imageRendering: 'pixelated' }}
            />
            {harbor.type === 'generic' ? (
              <text
                x={harborX - 19}
                y={harborY - 9}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#8b4513"
                fontWeight="bold"
                fontSize={42}
                style={{ pointerEvents: 'none' }}
              >
                ?
              </text>
            ) : (
              <image
                href={`/${harbor.type}-icon.png`}
                x={harborX - 36}
                y={harborY - 27}
                width={30}
                height={30}
                preserveAspectRatio="xMidYMid meet"
                style={{ pointerEvents: 'none', imageRendering: 'pixelated' }}
              />
            )}
          </g>
        )
      })}

      {/* Vertices (settlements = house images, cities = larger house images; potential spots = pixel-art icons) */}
      {vertices.map((v) => {
        const s = vertexStates[v.id]
        const hl = highlightedVertices?.has(v.id)
        // Only render vertices that have a structure or are highlighted
        if (!s && !hl) return null
        
        const player = s ? players[s.player - 1] : null
        const isCity = s?.type === 'city'
        // Settlement size; city scaled so the "settlement portion" of the city icon matches this size
        const settlementSize = 54
        const citySettlementRatio = 2 / 3  // settlement-like part is ~2/3 of city image height
        const size = isCity ? Math.round(settlementSize / citySettlementRatio) : settlementSize  // city = 81

        // Potential settlement spot: rendered in separate block below so it sits above the port
        if (hl && !s) return null
        
        if (player?.colorImage) {
          // Settlements use house image; cities use color-matched city icon
          const imageHref = isCity
            ? (COLOR_TO_CITY_IMAGE[player.colorImage] ?? player.colorImage)
            : player.colorImage
          return (
            <g key={v.id} data-board-interactive={selectVertex ? '' : undefined}>
              <image
                href={imageHref}
                x={v.x - size / 2}
                y={v.y - size / 2}
                width={size}
                height={size}
                preserveAspectRatio="xMidYMid meet"
                onClick={() => selectVertex?.(v.id)}
                style={{ 
                  cursor: selectVertex ? 'pointer' : 'default',
                  imageRendering: 'pixelated',
                  pointerEvents: 'auto',
                }}
              />
            </g>
          )
        } else {
          // Fallback to colored shapes (same scale as image icons)
          const col = s ? (PLAYER_COLORS[s.player] ?? '#888') : '#64b5f6'
          const r = size / 2
          return isCity ? (
            <rect
              key={v.id}
              x={v.x - r}
              y={v.y - r}
              width={size}
              height={size}
              fill={col}
              stroke={s ? '#1a1f2e' : '#64b5f6'}
              strokeWidth={6}
              onClick={() => selectVertex?.(v.id)}
              style={{ cursor: selectVertex ? 'pointer' : 'default' }}
            />
          ) : (
            <circle
              key={v.id}
              cx={v.x}
              cy={v.y}
              r={r}
              fill={col}
              stroke={s ? '#1a1f2e' : '#64b5f6'}
              strokeWidth={6}
              onClick={() => selectVertex?.(v.id)}
              style={{ cursor: selectVertex ? 'pointer' : 'default' }}
            />
          )
        }
      })}

      {/* Potential settlement spots - render after harbors so they sit above the port */}
      {vertices.map((v) => {
        const s = vertexStates[v.id]
        const hl = highlightedVertices?.has(v.id)
        if (!hl || s) return null
        const activePlayer = players[activePlayerIndex]
        const spotImage = activePlayer?.colorImage
          ? (COLOR_TO_SPOT_IMAGE[activePlayer.colorImage] ?? DEFAULT_SPOT_IMAGE)
          : DEFAULT_SPOT_IMAGE
        const spotSize = 48
        const pulse = pulsePlaceableSpots ?? (phase === 'setup')
        return (
          <g key={`spot-${v.id}`} transform={`translate(${v.x}, ${v.y})`} data-board-interactive={selectVertex ? '' : undefined}>
            <g>
              {pulse && (
                <animateTransform
                  attributeName="transform"
                  type="scale"
                  values="1;1.2;1"
                  dur="1.2s"
                  repeatCount="indefinite"
                  additive="replace"
                />
              )}
              <image
                href={spotImage}
                x={-spotSize / 2}
                y={-spotSize / 2}
                width={spotSize}
                height={spotSize}
                onClick={() => selectVertex?.(v.id)}
                style={{
                  cursor: selectVertex ? 'pointer' : 'default',
                  imageRendering: 'pixelated',
                  pointerEvents: 'auto',
                }}
              />
            </g>
          </g>
        )
      })}

      {/* City-upgrade indicators: downward triangle above settlements that can be upgraded (when Cities selected and can afford) */}
      {upgradableToCityVertices?.size
        ? vertices.map((v) => {
            if (!upgradableToCityVertices.has(v.id)) return null
            // Use the vertex owner's color so the indicator matches the settlement/city below it
            const s = vertexStates[v.id]
            const owner = s ? players[s.player - 1] : null
            const idx = owner?.colorImage
              ? (COLOR_TO_CITY_INDICATOR[owner.colorImage] ?? DEFAULT_CITY_INDICATOR)
              : DEFAULT_CITY_INDICATOR
            const indicatorW = 26
            const indicatorH = 26
            const offsetY = 42
            const centerX = v.x
            const centerY = v.y - offsetY - indicatorH / 2
            return (
              <g key={`city-upgrade-${v.id}`} transform={`translate(${centerX}, ${centerY})`} style={{ pointerEvents: 'none' }}>
                <g>
                  <animateTransform
                    attributeName="transform"
                    type="translate"
                    values="0 0; 0 -5; 0 0"
                    dur="1.2s"
                    repeatCount="indefinite"
                    additive="replace"
                  />
                  <image
                    href={`/city-upgrade-indicator-${idx}.png`}
                    x={-indicatorW / 2}
                    y={-indicatorH / 2}
                    width={indicatorW}
                    height={indicatorH}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </g>
              </g>
            )
          })
        : null}
    </svg>
  )
}
