/** Global buff definitions. Apply to all production (click + passive). Managers add on top. */
export interface GlobalBuffDef {
  id: string
  name: string
  description: string
  /** Multiplier (e.g. 1.5 = 50% more, 2 = double). Stacks multiplicatively. */
  multiplier: number
  /** Money cost to purchase */
  cost: number
  /** Minimum managers hired to unlock this buff */
  minManagersRequired: number
  /** Minimum hexes owned to unlock */
  minHexesRequired: number
}

export const GLOBAL_BUFFS: GlobalBuffDef[] = [
  {
    id: 'prod_1_5x',
    name: 'Modest Boost',
    description: '1.5× resource generation',
    multiplier: 1.5,
    cost: 500,
    minManagersRequired: 1,
    minHexesRequired: 2,
  },
  {
    id: 'prod_2x',
    name: 'Double Production',
    description: '2× resource generation',
    multiplier: 2,
    cost: 2000,
    minManagersRequired: 2,
    minHexesRequired: 3,
  },
  {
    id: 'prod_3x',
    name: 'Triple Production',
    description: '3× resource generation',
    multiplier: 3,
    cost: 10000,
    minManagersRequired: 3,
    minHexesRequired: 5,
  },
  {
    id: 'prod_5x',
    name: 'Production Surge',
    description: '5× resource generation',
    multiplier: 5,
    cost: 50000,
    minManagersRequired: 4,
    minHexesRequired: 7,
  },
]

export function getGlobalBuffsForState(
  purchasedBuffIds: string[],
  managersHired: number,
  hexesOwned: number
): { available: GlobalBuffDef[]; purchased: GlobalBuffDef[] } {
  const purchased = GLOBAL_BUFFS.filter((b) => purchasedBuffIds.includes(b.id))
  const available = GLOBAL_BUFFS.filter(
    (b) =>
      !purchasedBuffIds.includes(b.id) &&
      managersHired >= b.minManagersRequired &&
      hexesOwned >= b.minHexesRequired
  )
  return { available, purchased }
}

/** Combined multiplier from all purchased buffs. Stacks multiplicatively. */
export function getGlobalProductionMultiplier(purchasedBuffIds: string[]): number {
  return GLOBAL_BUFFS.filter((b) => purchasedBuffIds.includes(b.id))
    .reduce((acc, b) => acc * b.multiplier, 1)
}
