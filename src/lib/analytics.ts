import type { Address } from 'viem'
import type { Payment } from '@/lib/trustora'

const DAY = 86_400

export interface Counterparty {
  address: Address
  sent: bigint
  received: bigint
  count: number
  volume: bigint
}

export interface MonthBucket {
  key: string
  label: string
  sent: bigint
  received: bigint
}

export interface Analytics {
  count: number
  sentCount: number
  receivedCount: number
  sent: bigint
  received: bigint
  net: bigint
  /** Mean payment size across sent and received payments (0 when there are none). */
  average: bigint
  largest: bigint
  /** Percent change of total volume against the previous window of the same length, or null when it cannot be compared. */
  volumeChangePct: number | null
  months: MonthBucket[]
  /** Payments per weekday, Sunday first, using UTC days. */
  weekdays: number[]
  rails: { native: number; erc20: number }
  counterparties: Counterparty[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Everything here is computed from your confirmed payments through Trustora. `windowDays` null means all time. */
export function computeAnalytics(payments: Payment[], now: number, windowDays: number | null): Analytics {
  const all = payments.filter((p) => p.status === 'confirmed' && p.direction !== 'self')
  const inWindow = windowDays === null ? all : all.filter((p) => p.timestamp >= now - windowDays * DAY && p.timestamp <= now)

  let sent = 0n
  let received = 0n
  let sentCount = 0
  let receivedCount = 0
  let largest = 0n
  const weekdays = [0, 0, 0, 0, 0, 0, 0]
  const rails = { native: 0, erc20: 0 }
  const people = new Map<string, Counterparty>()

  for (const p of inWindow) {
    const incoming = p.direction === 'received'
    if (incoming) {
      received += p.amountRaw
      receivedCount++
    } else {
      sent += p.amountRaw
      sentCount++
    }
    if (p.amountRaw > largest) largest = p.amountRaw
    weekdays[new Date(p.timestamp * 1000).getUTCDay()]++
    rails[p.rail === 'native' ? 'native' : 'erc20']++
    const other = incoming ? p.sender : p.recipient
    const key = other.toLowerCase()
    const row = people.get(key) ?? { address: other, sent: 0n, received: 0n, count: 0, volume: 0n }
    if (incoming) row.received += p.amountRaw
    else row.sent += p.amountRaw
    row.count++
    row.volume += p.amountRaw
    people.set(key, row)
  }

  let volumeChangePct: number | null = null
  if (windowDays !== null) {
    const prevStart = now - 2 * windowDays * DAY
    const prevEnd = now - windowDays * DAY
    const prev = all.filter((p) => p.timestamp >= prevStart && p.timestamp < prevEnd).reduce((s, p) => s + p.amountRaw, 0n)
    if (prev > 0n) volumeChangePct = ((Number(sent + received) - Number(prev)) / Number(prev)) * 100
  }

  // Last six calendar months (UTC), oldest first.
  const today = new Date(now * 1000)
  const months: MonthBucket[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
    months.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getUTCMonth()], sent: 0n, received: 0n })
  }
  for (const p of all) {
    const d = new Date(p.timestamp * 1000)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const bucket = months.find((m) => m.key === key)
    if (!bucket) continue
    if (p.direction === 'received') bucket.received += p.amountRaw
    else bucket.sent += p.amountRaw
  }

  const count = sentCount + receivedCount
  return {
    count,
    sentCount,
    receivedCount,
    sent,
    received,
    net: received - sent,
    average: count > 0 ? (sent + received) / BigInt(count) : 0n,
    largest,
    volumeChangePct,
    months,
    weekdays,
    rails,
    counterparties: [...people.values()].sort((a, b) => (b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0)).slice(0, 6),
  }
}
