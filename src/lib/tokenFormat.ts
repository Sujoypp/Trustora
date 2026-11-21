/**
 * Formats a decimal string from a Circle SDK (for example "0.995123456789") for display: truncates to at most
 * `maxDecimals` places (never rounds a balance up), drops trailing zeros down to `minDecimals`, and groups thousands.
 * Works on the string itself, so there is no floating-point drift.
 */
export function formatDecimalString(value: string, maxDecimals = 6, minDecimals = 2): string {
  const trimmed = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed || '0'
  const negative = trimmed.startsWith('-')
  const [whole, frac = ''] = trimmed.replace('-', '').split('.')
  let decimals = frac.slice(0, maxDecimals).replace(/0+$/, '')
  decimals = decimals.padEnd(minDecimals, '0')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}.${decimals}`
}
