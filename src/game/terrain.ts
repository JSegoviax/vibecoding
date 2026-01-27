import type { Terrain } from './types'

export const TERRAIN_COLORS: Record<Terrain, string> = {
  wood: '#2d5a27',     // darker forest green
  brick: '#8b4512',    // reddish brown (hills)
  sheep: '#6b8e6b',    // lighter green (pasture)
  wheat: '#d4a84b',    // golden (fields)
  ore: '#6b6b7a',     // gray (mountains)
  desert: '#c9a96e',   // sandy tan
}

export const TERRAIN_LABELS: Record<Terrain, string> = {
  wood: 'Wood',
  brick: 'Brick',
  sheep: 'Sheep',
  wheat: 'Wheat',
  ore: 'Ore',
  desert: 'Desert',
}
