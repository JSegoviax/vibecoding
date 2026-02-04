/** Tiered manager names. Tier N manager can only be hired for tier N hex. */
export const MANAGER_NAMES: string[] = [
  'Hired Hand',    // tier 1
  'Laborer',       // tier 2
  'Foreman',       // tier 3
  'Camp Boss',     // tier 4
  'Supervisor',    // tier 5
  'Trail Boss',    // tier 6
  'Superintendent',// tier 7
  'Claim Keeper',  // tier 8
  'Factor',        // tier 9
  'Wagon Master',  // tier 10
]

export function getManagerName(tier: number): string {
  const index = Math.min(Math.max(0, tier - 1), MANAGER_NAMES.length - 1)
  return MANAGER_NAMES[index] ?? MANAGER_NAMES[0]
}
