/** Format large numbers AdVenture Capitalist style: 1.5K, 2.3M, 4.7B, 1.2T */
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'] as const

export function formatNumber(n: number, decimals = 1): string {
  if (n < 0) return '-' + formatNumber(-n, decimals)
  if (n < 1000) return Math.floor(n).toString()
  const tier = Math.floor(Math.log10(n) / 3)
  const suffix = SUFFIXES[Math.min(tier, SUFFIXES.length - 1)]
  const scale = Math.pow(1000, tier)
  const scaled = n / scale
  const fixed = scaled.toFixed(decimals)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return trimmed + suffix
}
