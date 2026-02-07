/** Prestige system: Pioneer Spirits */

export const PRESTIGE_CONFIG = {
  DIVISOR: 1_000_000, // $1M earned = 1 Spirit (base)
  BONUS_PER_SPIRIT: 0.02, // +2% production per Spirit
} as const

export interface PrestigeUpgradeDef {
  id: string
  name: string
  description: string
  cost: number
}

export const PRESTIGE_SHOP: PrestigeUpgradeDef[] = [
  {
    id: 'manifest_destiny',
    name: 'Manifest Destiny',
    description: 'Start with 5+ level hexes (max 19)',
    cost: 10,
  },
  {
    id: 'gold_rush_legacy',
    name: 'Gold Rush Legacy',
    description: 'Keep 5+ level % money (max 50%)',
    cost: 50,
  },
  {
    id: 'industrialist',
    name: 'Industrialist',
    description: 'Managers 10+ level % cheaper (max 50%)',
    cost: 100,
  },
]

/** Calculate claimable spirits based on lifetime earnings. */
export function calculateClaimableSpirits(lifetimeEarnings: number): number {
  return Math.floor(lifetimeEarnings / PRESTIGE_CONFIG.DIVISOR)
}

/** Get production multiplier from pioneer spirits. */
export function getSpiritProductionMultiplier(pioneerSpirits: number): number {
  return 1 + pioneerSpirits * PRESTIGE_CONFIG.BONUS_PER_SPIRIT
}
