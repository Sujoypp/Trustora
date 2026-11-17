import { useEffect, useState } from 'react'
import { useLocalStore } from '@/lib/localStore'

export type Currency = 'USD' | 'EUR' | 'GBP'

export const CURRENCIES: { code: Currency; symbol: string }[] = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '\u20ac' },
  { code: 'GBP', symbol: '\u00a3' },
]

export const symbolOf = (c: Currency) => CURRENCIES.find((x) => x.code === c)?.symbol ?? '$'

/** Reference rates from the European Central Bank, served by Frankfurter (no key needed). */
const RATE_URL = 'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP'
const CACHE_KEY = 'trustora:fx'
const MAX_AGE_MS = 6 * 60 * 60 * 1000

export interface FxRates {
  EUR: number
  GBP: number
  /** The date the ECB published these rates. */
  date: string
  fetchedAt: number
}

const parseCurrency = (raw: string): Currency => {
  try {
    const v: unknown = JSON.parse(raw)
    return v === 'EUR' || v === 'GBP' ? v : 'USD'
  } catch {
    return 'USD'
  }
}

/** The display currency saved in this browser. */
export function useCurrency(): [Currency, (next: Currency) => void] {
  return useLocalStore('trustora:currency', parseCurrency, 'USD')
}

function readCache(): FxRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as FxRates
    return typeof d.EUR === 'number' && typeof d.GBP === 'number' ? d : null
  } catch {
    return null
  }
}

/** Live USD to EUR and GBP rates, cached for 6 hours. `failed` is true only when no rate could be loaded. */
export function useFxRates(): { rates: FxRates | null; failed: boolean } {
  const [rates, setRates] = useState<FxRates | null>(readCache)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (rates && Date.now() - rates.fetchedAt < MAX_AGE_MS) return
    const ctx = { cancelled: false }
    void (async () => {
      try {
        const res = await fetch(RATE_URL)
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { date?: string; rates?: { EUR?: number; GBP?: number } }
        const EUR = data.rates?.EUR
        const GBP = data.rates?.GBP
        if (typeof EUR !== 'number' || typeof GBP !== 'number') throw new Error('bad shape')
        const next: FxRates = { EUR, GBP, date: data.date ?? '', fetchedAt: Date.now() }
        localStorage.setItem(CACHE_KEY, JSON.stringify(next))
        if (!ctx.cancelled) setRates(next)
      } catch {
        if (!ctx.cancelled) setFailed(true)
      }
    })()
    return () => {
      ctx.cancelled = true
    }
  }, [rates])

  return { rates, failed: failed && rates === null }
}

/** Converts a 6-decimal USDC amount into the chosen currency (USDC is treated as 1 USD). */
export function toFiat(raw: bigint, currency: Currency, rates: FxRates | null): bigint {
  if (currency === 'USD' || !rates) return raw
  return (raw * BigInt(Math.round(rates[currency] * 1_000_000))) / 1_000_000n
}
