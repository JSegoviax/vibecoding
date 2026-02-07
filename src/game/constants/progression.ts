/** AdCap-style progression constants. */

export const MILESTONES = [10, 25, 50, 100, 200, 300, 400, 500, 1000] as const

export const COST_RATE = 1.07 // r in geometric series

export const GLOBAL_MILESTONES = [25, 50, 100, 200] as const

export const TERRAIN_CONFIG = {
  wood: { baseCycleTime: 1.0, baseValue: 1 },
  brick: { baseCycleTime: 1.5, baseValue: 5 },
  sheep: { baseCycleTime: 3.0, baseValue: 20 },
  wheat: { baseCycleTime: 6.0, baseValue: 100 },
  ore: { baseValue: 500, baseCycleTime: 12.0 },
} as const
