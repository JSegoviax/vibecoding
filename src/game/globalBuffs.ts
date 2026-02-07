/** Global buff definitions. Apply to all production (click + passive). Managers add on top. */
export interface GlobalBuffDef {
  id: string
  name: string
  description: string
  /** Multiplier (e.g. 1.5 = 50% more, 2 = double). Stacks multiplicatively. Use 1 for non-production buffs. */
  multiplier: number
  /** Money cost to purchase */
  cost: number
  /** Minimum managers hired to unlock this buff */
  minManagersRequired: number
  /** Minimum hexes owned to unlock */
  minHexesRequired: number
  /** If true, this buff enables auto hex upgrading (spends money on upgrades automatically) */
  autoUpgrade?: boolean
  /** If true, this buff enables auto Spirit Shop upgrading (spends spirits on prestige upgrades automatically) */
  autoSpiritShop?: boolean
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
  {
    id: 'auto_hex_upgrader',
    name: 'Auto Hex Upgrader',
    description: 'Automatically upgrades hexes when affordable',
    multiplier: 1,
    cost: 25000,
    minManagersRequired: 3,
    minHexesRequired: 4,
    autoUpgrade: true,
  },
  {
    id: 'prod_10x',
    name: 'Mega Production',
    description: '10× resource generation',
    multiplier: 10,
    cost: 500000,
    minManagersRequired: 6,
    minHexesRequired: 12,
  },
  {
    id: 'prod_20x',
    name: 'Hyper Production',
    description: '20× resource generation',
    multiplier: 20,
    cost: 2500000,
    minManagersRequired: 8,
    minHexesRequired: 15,
  },
  {
    id: 'prod_50x',
    name: 'Omega Production',
    description: '50× resource generation',
    multiplier: 50,
    cost: 25000000,
    minManagersRequired: 10,
    minHexesRequired: 18,
  },
  {
    id: 'auto_spirit_shop',
    name: 'Auto Spirit Shop',
    description: 'Automatically upgrades Spirit Shop when affordable',
    multiplier: 1,
    cost: 100000,
    minManagersRequired: 5,
    minHexesRequired: 10,
    autoSpiritShop: true,
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

/** Whether the player has purchased the Auto Hex Upgrader buff. */
export function hasAutoUpgradeBuff(purchasedBuffIds: string[]): boolean {
  return GLOBAL_BUFFS.some(
    (b) => purchasedBuffIds.includes(b.id) && b.autoUpgrade === true
  )
}

/** Whether the player has purchased the Auto Spirit Shop buff. */
export function hasAutoSpiritShopBuff(purchasedBuffIds: string[]): boolean {
  return GLOBAL_BUFFS.some(
    (b) => purchasedBuffIds.includes(b.id) && b.autoSpiritShop === true
  )
}
