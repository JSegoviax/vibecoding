import type { Terrain } from './types'

/** Tiered business names per resource type. Level 1 = tier 1, level 2 = tier 2, etc. */
export const BUSINESS_NAMES: Record<Terrain, string[]> = {
  wood: [
    'Campfire',
    'Chopping Block',
    'Woodpile',
    'Logging Camp',
    'Sawmill',
    'Lumber Yard',
    'Timber Company',
    'Forest Operation',
    'Timber Empire',
    'Lumber Dynasty',
  ],
  brick: [
    'Mud Pit',
    'Clay Dig',
    'Brick Kiln',
    'Brickyard',
    'Masonry Works',
    'Brick Factory',
    'Industrial Kiln',
    'Brick Corporation',
    'Masonry Empire',
    'Brick Dynasty',
  ],
  sheep: [
    'Stray Flock',
    'Sheep Pen',
    'Pasture',
    'Wool Ranch',
    'Sheep Farm',
    'Wool Shed',
    'Livestock Company',
    'Wool Mill',
    'Ranch Empire',
    'Wool Dynasty',
  ],
  wheat: [
    'Wild Grain',
    'Small Plot',
    'Wheat Field',
    'Farmstead',
    'Grain Silo',
    'Wheat Farm',
    'Flour Mill',
    'Agricultural Co.',
    'Grain Empire',
    'Wheat Dynasty',
  ],
  ore: [
    'Rock Picking',
    'Prospect Hole',
    'Mine Shaft',
    'Mining Camp',
    'Ore Mine',
    'Quarry',
    'Mining Company',
    'Industrial Mine',
    'Mining Empire',
    'Ore Dynasty',
  ],
  desert: ['Oasis', 'Trading Post', 'Desert Outpost', 'Caravan Stop', 'Sand Bazaar', 'Oasis Town', 'Desert Hub', 'Trade Empire', 'Desert Empire', 'Sand Dynasty'],
}

export function getBusinessName(terrain: Terrain, level: number): string {
  const names = BUSINESS_NAMES[terrain]
  const index = Math.min(Math.max(0, level - 1), names.length - 1)
  return names[index] ?? names[0]
}
