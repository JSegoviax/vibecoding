/** Supply Chain: Adjacency bonuses based on neighboring hexes. */

import type { Terrain } from './types'

export interface AdjacencyBonus {
  /** Neighbor terrain type that provides the bonus */
  neighborType: Terrain
  /** Target terrain type that receives the bonus */
  targetType: Terrain
  /** Type of bonus */
  effect: 'production_multiplier' | 'cycle_time_reduction' | 'upgrade_cost_discount'
  /** Bonus value (additive for multipliers, percentage reduction for others) */
  value: number
}

/** Adjacency bonus matrix. Buffs are directional and stack additively. */
export const ADJACENCY_BONUSES: AdjacencyBonus[] = [
  {
    neighborType: 'wheat',
    targetType: 'sheep',
    effect: 'production_multiplier',
    value: 0.25, // +0.25x per adjacent wheat
  },
  {
    neighborType: 'ore',
    targetType: 'brick',
    effect: 'cycle_time_reduction',
    value: 0.1, // -10% cycle time per adjacent ore
  },
  {
    neighborType: 'wood',
    targetType: 'ore',
    effect: 'upgrade_cost_discount',
    value: 0.05, // -5% upgrade cost per adjacent wood
  },
]

/** Get adjacency multiplier for a hex based on its neighbors. */
export function getAdjacencyMultiplier(
  hexId: string,
  hexes: Array<{ id: string; q: number; r: number; terrain: Terrain }>,
  ownedHexIds: Set<string>
): { productionMult: number; cycleTimeMult: number; upgradeDiscount: number } {
  const hex = hexes.find((h) => h.id === hexId)
  if (!hex) return { productionMult: 1, cycleTimeMult: 1, upgradeDiscount: 0 }

  const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const
  const match = hexId.match(/^h(-?\d+),(-?\d+)$/)
  if (!match) return { productionMult: 1, cycleTimeMult: 1, upgradeDiscount: 0 }

  const q = parseInt(match[1], 10)
  const r = parseInt(match[2], 10)
  const byId = new Map(hexes.map((h) => [h.id, h]))

  let productionMult = 1
  let cycleTimeMult = 1
  let upgradeDiscount = 0

  for (const [dq, dr] of NEIGHBORS) {
    const nid = `h${q + dq},${r + dr}`
    const neighbor = byId.get(nid)
    if (!neighbor || !ownedHexIds.has(nid)) continue

    // Check all bonuses that apply to this hex's terrain
    for (const bonus of ADJACENCY_BONUSES) {
      if (bonus.neighborType === neighbor.terrain && bonus.targetType === hex.terrain) {
        switch (bonus.effect) {
          case 'production_multiplier':
            productionMult += bonus.value
            break
          case 'cycle_time_reduction':
            cycleTimeMult *= 1 - bonus.value
            break
          case 'upgrade_cost_discount':
            upgradeDiscount += bonus.value
            break
        }
      }
    }
  }

  return { productionMult, cycleTimeMult: Math.max(0.1, cycleTimeMult), upgradeDiscount }
}
