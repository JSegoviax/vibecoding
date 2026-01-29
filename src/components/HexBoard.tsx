import { useMemo } from 'react'
import { hexToPixel, hexCorner, HEX_R, getWaterHexPositions } from '../game/board'
import { buildTopology } from '../game/topology'
import { TERRAIN_COLORS } from '../game/terrain'
import type { Hex, Harbor, Terrain } from '../game/types'

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
}: HexBoardProps) {
  const { vertices, edges } = useMemo(() => buildTopology(hexes), [hexes])
  const vById = useMemo(() => Object.fromEntries(vertices.map(v => [v.id, v])), [vertices])
  const eById = useMemo(() => Object.fromEntries(edges.map(e => [e.id, e])), [edges])

  const waterPositions = useMemo(() => getWaterHexPositions(), [])

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
  
  // Use actual bounds with minimal padding (reduce padding to make board larger)
  const padding = HEX_R * 0.3 // Reduced from 2 * HEX_R to make board fill more space
  const w = useMemo(() => (bounds.maxX - bounds.minX) + padding * 2, [bounds, padding])
  const h = useMemo(() => (bounds.maxY - bounds.minY) + padding * 2, [bounds, padding])

  const PLAYER_COLORS: Record<number, string> = {
    1: '#e53935',
    2: '#1e88e5',
    3: '#43a047',
    4: '#fb8c00',
  }

  const TOKEN_R = 36

  // Helper function to get player color
  const getPlayerColor = (playerId: number): string => {
    const player = players[playerId - 1]
    return player?.color || PLAYER_COLORS[playerId] || '#888'
  }

  return (
    <svg viewBox={`${bounds.minX - padding} ${bounds.minY - padding} ${w} ${h}`} width="100%" height="100%" style={{ maxHeight: '90vh', minHeight: 500, width: '100%', position: 'relative', zIndex: 1 }}>
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
        return (
          <g key={`w${q},${r}`}>
            <g clipPath={`url(#water-clip-${q},${r})`}>
              <image
                href="/water-hex.png"
                x={center.x - HEX_R * 2}
                y={center.y - HEX_R * 2}
                width={HEX_R * 4}
                height={HEX_R * 4}
                preserveAspectRatio="none"
                style={{ imageRendering: 'pixelated' }}
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
        const fill = TERRAIN_COLORS[h.terrain]
        const isRobberHex = h.id === robberHexId
        const isSelectable = selectableRobberHexes?.has(h.id)
        return (
          <g key={h.id}>
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
                  x={center.x - HEX_R * 2}
                  y={center.y - HEX_R * 2}
                  width={HEX_R * 4}
                  height={HEX_R * 4}
                  preserveAspectRatio="none"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.terrain === 'brick' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/brick-hex.png"
                  x={center.x - HEX_R * 2}
                  y={center.y - HEX_R * 2}
                  width={HEX_R * 4}
                  height={HEX_R * 4}
                  preserveAspectRatio="none"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.terrain === 'wheat' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/wheat-hex.png"
                  x={center.x - HEX_R * 2}
                  y={center.y - HEX_R * 2}
                  width={HEX_R * 4}
                  height={HEX_R * 4}
                  preserveAspectRatio="none"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.terrain === 'ore' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/ore-hex.png"
                  x={center.x - HEX_R * 2}
                  y={center.y - HEX_R * 2}
                  width={HEX_R * 4}
                  height={HEX_R * 4}
                  preserveAspectRatio="none"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.terrain === 'sheep' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/sheep-hex.png"
                  x={center.x - HEX_R * 2}
                  y={center.y - HEX_R * 2}
                  width={HEX_R * 4}
                  height={HEX_R * 4}
                  preserveAspectRatio="none"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.terrain === 'desert' && (
              <g clipPath={`url(#hex-clip-${h.id})`}>
                <image
                  href="/desert-hex.png"
                  x={center.x - HEX_R * 2}
                  y={center.y - HEX_R * 2}
                  width={HEX_R * 4}
                  height={HEX_R * 4}
                  preserveAspectRatio="none"
                  style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              </g>
            )}
            {h.number != null && (
              <text
                x={center.x}
                y={center.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={h.number === 6 || h.number === 8 ? '#b91c1c' : '#2d2216'}
                fontWeight="bold"
                fontSize={47.5}
                stroke="#ffffff"
                strokeWidth={2}
                paintOrder="stroke"
                style={{ pointerEvents: 'none' }}
              >
                {h.number}
              </text>
            )}
            {isRobberHex && (
              <circle
                cx={center.x}
                cy={center.y}
                r={20}
                fill="#2d1f14"
                stroke="#1a120c"
                strokeWidth={2}
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        )
      })}

      {/* Edges (roads) */}
      {edges.map(e => {
        const v1 = vById[e.v1]
        const v2 = vById[e.v2]
        if (!v1 || !v2) return null
        const pid = edgeStates[e.id]
        const hl = highlightedEdges?.has(e.id)
        return (
          <line
            key={e.id}
            x1={v1.x}
            y1={v1.y}
            x2={v2.x}
            y2={v2.y}
            stroke={pid ? getPlayerColor(pid) : hl ? '#64b5f6' : 'transparent'}
            strokeWidth={pid || hl ? 24 : 0}
            strokeLinecap="round"
            onClick={() => selectEdge?.(e.id)}
            style={{ cursor: selectEdge ? 'pointer' : 'default' }}
          />
        )
      })}

      {/* Vertices (settlements = house images, cities = larger house images) */}
      {vertices.map(v => {
        const s = vertexStates[v.id]
        const hl = highlightedVertices?.has(v.id)
        // Only render vertices that have a structure or are highlighted
        if (!s && !hl) return null
        
        const player = s ? players[s.player - 1] : null
        const isCity = s?.type === 'city'
        const size = isCity ? 48 : 36
        
        if (player?.colorImage) {
          // Use house image
          return (
            <g key={v.id}>
              <image
                href={player.colorImage}
                x={v.x - size / 2}
                y={v.y - size / 2}
                width={size}
                height={size}
                onClick={() => selectVertex?.(v.id)}
                style={{ 
                  cursor: selectVertex ? 'pointer' : 'default',
                  imageRendering: 'pixelated',
                  pointerEvents: 'auto',
                }}
              />
              {hl && !s && (
                <circle
                  cx={v.x}
                  cy={v.y}
                  r={size / 2 + 4}
                  fill="none"
                  stroke="#64b5f6"
                  strokeWidth={4}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          )
        } else {
          // Fallback to colored shapes
          const col = s ? (PLAYER_COLORS[s.player] ?? '#888') : '#64b5f6'
          return isCity ? (
            <rect
              key={v.id}
              x={v.x - 30}
              y={v.y - 30}
              width={60}
              height={60}
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
              r={24}
              fill={col}
              stroke={s ? '#1a1f2e' : '#64b5f6'}
              strokeWidth={6}
              onClick={() => selectVertex?.(v.id)}
              style={{ cursor: selectVertex ? 'pointer' : 'default' }}
            />
          )
        }
      })}

      {/* Harbors - render after other elements to ensure visibility */}
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
        
        // Position harbor icon at the midpoint of the edge, offset outward toward water
        const midX = (v1.x + v2.x) / 2
        const midY = (v1.y + v2.y) / 2
        
        // Calculate perpendicular vector to the edge (two possible directions)
        const dx = v2.x - v1.x
        const dy = v2.y - v1.y
        const perpX1 = -dy
        const perpY1 = dx
        const perpX2 = dy
        const perpY2 = -dx
        
        // Determine which direction points outward (away from board center, toward water)
        // Calculate vector from board center to midpoint
        const centerToMidX = midX - cx
        const centerToMidY = midY - cy
        
        // Dot product to determine which perpendicular points outward
        const dot1 = perpX1 * centerToMidX + perpY1 * centerToMidY
        const dot2 = perpX2 * centerToMidX + perpY2 * centerToMidY
        
        // Use the perpendicular that points outward (positive dot product)
        const perpX = dot1 > dot2 ? perpX1 : perpX2
        const perpY = dot1 > dot2 ? perpY1 : perpY2
        
        // Normalize and scale the offset (offset further out onto the water hex)
        const len = Math.sqrt(perpX * perpX + perpY * perpY)
        const offsetDistance = HEX_R * 0.6 // Offset further out onto water hex
        const offsetX = len > 0 ? (perpX / len) * offsetDistance : 0
        const offsetY = len > 0 ? (perpY / len) * offsetDistance : 0
        
        const harborX = midX + offsetX
        const harborY = midY + offsetY
        
        return (
          <g key={harbor.id} style={{ zIndex: 100 }}>
            {/* Harbor background circle - larger and more visible */}
            <circle
              cx={harborX}
              cy={harborY}
              r={24}
              fill="#fff8dc"
              stroke="#8b4513"
              strokeWidth={3}
              style={{ pointerEvents: 'none' }}
              opacity={0.95}
            />
            {/* Harbor type indicator */}
            {harbor.type === 'generic' ? (
              <text
                x={harborX}
                y={harborY}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#8b4513"
                fontWeight="bold"
                fontSize={18}
                style={{ pointerEvents: 'none' }}
              >
                ?
              </text>
            ) : (
              <>
                <text
                  x={harborX}
                  y={harborY - 4}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#8b4513"
                  fontWeight="bold"
                  fontSize={14}
                  style={{ pointerEvents: 'none' }}
                >
                  2:1
                </text>
                {/* Small resource icon for 2:1 harbors */}
                <circle
                  cx={harborX}
                  cy={harborY + 10}
                  r={8}
                  fill={TERRAIN_COLORS[harbor.type as Terrain]}
                  stroke="#fff"
                  strokeWidth={1}
                  style={{ pointerEvents: 'none' }}
                />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
