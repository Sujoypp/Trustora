import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { CHAIN_ID } from '@/lib/trustora'

export const shortAddress = (address: string, head = 6, tail = 4) =>
  `${address.slice(0, head)}...${address.slice(-tail)}`

export const shortHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`

/** Formats a 6-decimal USDC amount with thousands separators. */
export function formatUsdc(raw: bigint, fractionDigits = 2): string {
  const fixed = Amount.fromRaw(raw, usdcDecimalsFor(CHAIN_ID)).toFixed(fractionDigits)
  const [whole, frac] = fixed.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac ? `${grouped}.${frac}` : grouped
}

export function timeAgo(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds)
  if (diff < 10) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fullDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

export const noteBytes = (note: string) => new TextEncoder().encode(note).length


/** A network fee in USDC (6-decimal view): never shows a misleading 0.0000 for a tiny non-zero fee. */
export function formatFeeUsdc(raw: bigint): string {
  if (raw === 0n) return '0'
  if (raw < 100n) return '<0.0001'
  return formatUsdc(raw, 4)
}
