import { parseUnits } from 'viem'

export const USDC_DECIMALS = 6
export const AMOUNT_INPUT_RE = /^\d{0,12}(\.\d{0,6})?$/

/** Parses a USDC amount typed by a person into base units; null when empty, zero or malformed. */
export function parseUsdcInput(value: string): bigint | null {
  if (!/^\d+(\.\d{1,6})?$|^\.\d{1,6}$/.test(value.trim())) return null
  const raw = parseUnits(value.trim().startsWith('.') ? `0${value.trim()}` : value.trim(), USDC_DECIMALS)
  return raw > 0n ? raw : null
}

/** A date input value (YYYY-MM-DD) as the end of that local day, in unix seconds; 0 when empty. */
export function endOfDayUnix(value: string): bigint {
  if (!value) return 0n
  const t = new Date(`${value}T23:59:59`).getTime()
  return Number.isFinite(t) ? BigInt(Math.floor(t / 1000)) : 0n
}

/** Unix seconds for a date and time input pair (local time). */
export function dateTimeUnix(date: string, time: string): bigint {
  if (!date) return 0n
  const t = new Date(`${date}T${time || '00:00'}`).getTime()
  return Number.isFinite(t) ? BigInt(Math.floor(t / 1000)) : 0n
}
