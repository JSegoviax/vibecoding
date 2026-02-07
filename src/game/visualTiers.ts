/** Visual Upgrade Tiers: Visual feedback of growth beyond numbers. */

import type { Terrain } from './types'

export interface HexVisual {
  name: string
  icon: string
  cssClass: string
}

const VISUAL_TIERS = [25, 100, 250, 500] as const

const HEX_VISUALS: Record<Terrain, HexVisual[][]> = {
  wood: [
    [
      { name: 'Logging Camp', icon: 'axe_stump', cssClass: 'tier-1' },
      { name: 'Sawmill', icon: 'water_wheel', cssClass: 'tier-2' },
      { name: 'Lumber Yard', icon: 'stacked_timber', cssClass: 'tier-3' },
      { name: 'Timber Corp', icon: 'factory_wood', cssClass: 'tier-4' },
      { name: 'Paper Empire', icon: 'skyscraper_wood', cssClass: 'tier-5' },
    ],
  ],
  brick: [
    [
      { name: 'Mud Pit', icon: 'mud_pit', cssClass: 'tier-1' },
      { name: 'Clay Kiln', icon: 'kiln', cssClass: 'tier-2' },
      { name: 'Brickyard', icon: 'brick_yard', cssClass: 'tier-3' },
      { name: 'Masonry Works', icon: 'masonry', cssClass: 'tier-4' },
      { name: 'Brick Empire', icon: 'brick_empire', cssClass: 'tier-5' },
    ],
  ],
  sheep: [
    [
      { name: 'Stray Flock', icon: 'sheep', cssClass: 'tier-1' },
      { name: 'Sheep Pen', icon: 'pen', cssClass: 'tier-2' },
      { name: 'Wool Ranch', icon: 'ranch', cssClass: 'tier-3' },
      { name: 'Livestock Co.', icon: 'livestock', cssClass: 'tier-4' },
      { name: 'Wool Empire', icon: 'wool_empire', cssClass: 'tier-5' },
    ],
  ],
  wheat: [
    [
      { name: 'Wild Grain', icon: 'grain', cssClass: 'tier-1' },
      { name: 'Small Plot', icon: 'plot', cssClass: 'tier-2' },
      { name: 'Wheat Field', icon: 'field', cssClass: 'tier-3' },
      { name: 'Grain Silo', icon: 'silo', cssClass: 'tier-4' },
      { name: 'Wheat Empire', icon: 'wheat_empire', cssClass: 'tier-5' },
    ],
  ],
  ore: [
    [
      { name: 'Rock Picking', icon: 'rock', cssClass: 'tier-1' },
      { name: 'Mine Shaft', icon: 'shaft', cssClass: 'tier-2' },
      { name: 'Mining Camp', icon: 'camp', cssClass: 'tier-3' },
      { name: 'Industrial Mine', icon: 'mine', cssClass: 'tier-4' },
      { name: 'Ore Empire', icon: 'ore_empire', cssClass: 'tier-5' },
    ],
  ],
  desert: [
    [
      { name: 'Oasis', icon: 'oasis', cssClass: 'tier-1' },
      { name: 'Trading Post', icon: 'post', cssClass: 'tier-2' },
      { name: 'Desert Outpost', icon: 'outpost', cssClass: 'tier-3' },
      { name: 'Caravan Stop', icon: 'caravan', cssClass: 'tier-4' },
      { name: 'Sand Empire', icon: 'sand_empire', cssClass: 'tier-5' },
    ],
  ],
}

/** Get visual tier for a given level. Returns index 0-4. */
function getVisualTierIndex(level: number): number {
  if (level < VISUAL_TIERS[0]) return 0
  if (level < VISUAL_TIERS[1]) return 1
  if (level < VISUAL_TIERS[2]) return 2
  if (level < VISUAL_TIERS[3]) return 3
  return 4
}

/** Get visual configuration for a hex based on terrain and level. */
export function getHexVisual(terrain: Terrain, level: number): HexVisual {
  const visuals = HEX_VISUALS[terrain]?.[0] ?? HEX_VISUALS.wood[0]
  const tierIndex = getVisualTierIndex(level)
  return visuals[Math.min(tierIndex, visuals.length - 1)] ?? visuals[0]
}
