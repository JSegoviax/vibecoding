import { useMemo } from 'react'
import { hexToPixel, hexCorner, HEX_R, getWaterHexPositions } from '../game/board'
import { buildTopology } from '../game/topology'
import { TERRAIN_COLORS } from '../game/terrain'
import type { Hex } from '../game/types'

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

  return (
    <svg viewBox={`${bounds.minX - padding} ${bounds.minY - padding} ${w} ${h}`} width="100%" height="100%" style={{ maxHeight: '90vh', minHeight: 500, width: '100%' }}>
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
                  style={{ imageRendering: 'pixelated' }}
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
                  style={{ imageRendering: 'pixelated' }}
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
                  style={{ imageRendering: 'pixelated' }}
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
                  style={{ imageRendering: 'pixelated' }}
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
                  style={{ imageRendering: 'pixelated' }}
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
            stroke={pid ? PLAYER_COLORS[pid] ?? '#888' : hl ? '#64b5f6' : 'transparent'}
            strokeWidth={pid || hl ? 24 : 0}
            strokeLinecap="round"
            onClick={() => selectEdge?.(e.id)}
            style={{ cursor: selectEdge ? 'pointer' : 'default' }}
          />
        )
      })}

      {/* Vertices (settlements = circles, cities = squares) */}
      {vertices.map(v => {
        const s = vertexStates[v.id]
        const hl = highlightedVertices?.has(v.id)
        const col = s ? (PLAYER_COLORS[s.player] ?? '#888') : (hl ? '#64b5f6' : 'transparent')
        const isCity = s?.type === 'city'
        return isCity ? (
          <rect
            key={v.id}
            x={v.x - 30}
            y={v.y - 30}
            width={60}
            height={60}
            fill={col}
            stroke={col ? '#1a1f2e' : (hl ? '#64b5f6' : 'transparent')}
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
            stroke={col ? '#1a1f2e' : (hl ? '#64b5f6' : 'transparent')}
            strokeWidth={6}
            onClick={() => selectVertex?.(v.id)}
            style={{ cursor: selectVertex ? 'pointer' : 'default' }}
          />
        )
      })}
    </svg>
  )
}
