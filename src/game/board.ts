import type { Hex, Terrain } from './types'

// 19 hexes in Catan-shaped layout (axial coords: q, r)
export const AXIAL_COORDS: [number, number][] = [
  [0, -2], [1, -2],
  [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
  [-2, 1], [-1, 1], [0, 1], [1, 1],
  [-1, 2], [0, 2], [1, 2],
]

const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const

/** Returns (q,r) positions for the water hex ring around the land. */
export function getWaterHexPositions(): [number, number][] {
  const land = new Set(AXIAL_COORDS.map(([q, r]) => `${q},${r}`))
  const seen = new Set<string>()
  const water: [number, number][] = []
  for (const [q, r] of AXIAL_COORDS) {
    for (const [dq, dr] of NEIGHBORS) {
      const nq = q + dq
      const nr = r + dr
      const key = `${nq},${nr}`
      if (!land.has(key) && !seen.has(key)) {
        seen.add(key)
        water.push([nq, nr])
      }
    }
  }
  return water
}

// Terrain: 4 wood, 4 brick, 4 wheat, 3 sheep, 3 ore, 1 desert
const TERRAINS: Terrain[] = [
  'wood', 'wood', 'wood', 'wood',
  'brick', 'brick', 'brick', 'brick',
  'wheat', 'wheat', 'wheat', 'wheat',
  'sheep', 'sheep', 'sheep',
  'ore', 'ore', 'ore',
  'desert',
]

// Numbers 2–12 (no 7), each except 2 and 12 appear twice
const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]

function shuffle<T>(a: T[]): T[] {
  const out = [...a]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function createBoard(): Hex[] {
  const terrains = shuffle(TERRAINS)
  const numbers = shuffle(NUMBERS)
  let n = 0
  return AXIAL_COORDS.map(([q, r], i) => {
    const terrain = terrains[i]
    const num = terrain === 'desert' ? null : numbers[n++]
    return { id: `h${q},${r}`, q, r, terrain, number: num }
  })
}

// Flat-top hex: corner 0 at top, then clockwise. Pixel offset for hex at (q,r).
const SQ3 = Math.sqrt(3)
export const HEX_R = 108

export function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_R * SQ3 * (q + r / 2)
  const y = HEX_R * (3 / 2) * r
  return { x, y }
}

export function hexCorner(center: { x: number; y: number }, i: number): { x: number; y: number } {
  const angle = (Math.PI / 3) * i
  return {
    x: center.x + HEX_R * Math.sin(angle),
    y: center.y - HEX_R * Math.cos(angle),
  }
}
