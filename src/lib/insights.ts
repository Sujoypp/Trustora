import type { Address, Hex } from 'viem'
import { tagsOf } from '@/lib/paymentFilters'
import type { Payment } from '@/lib/trustora'

const DAY = 86_400

export type Severity = 'info' | 'notice' | 'warning'

export interface Insight {
  id: string
  severity: Severity
  title: string
  detail: string
  txHash?: Hex
  address?: Address
}

export interface CategoryTotal {
  tag: string
  sent: bigint
  count: number
}

const usdc = (raw: bigint) => (Number(raw) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const RANK: Record<Severity, number> = { warning: 0, notice: 1, info: 2 }

/**
 * Rule-based insights computed only from your confirmed payments: first-time recipients, unusually large payments,
 * possible duplicates, payments that repeat on a schedule, and concentration. No guesses and no outside data.
 */
export function buildInsights(payments: Payment[], now: number): { insights: Insight[]; categories: CategoryTotal[] } {
  const sends = payments
    .filter((p) => p.status === 'confirmed' && p.direction === 'sent')
    .sort((a, b) => a.timestamp - b.timestamp || Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex)
  const insights: Insight[] = []

  // First-time recipients in the last 7 days
  const seen = new Set<string>()
  for (const p of sends) {
    const key = p.recipient.toLowerCase()
    if (!seen.has(key) && p.timestamp >= now - 7 * DAY) {
      insights.push({ id: `new:${p.txHash}`, severity: 'notice', title: 'First payment to a new address', detail: `You sent ${usdc(p.amountRaw)} USDC to ${short(p.recipient)} for the first time. Check the address if you did not expect it.`, txHash: p.txHash, address: p.recipient })
    }
    seen.add(key)
  }

  // Unusually large payments compared with the median of everything sent before (needs 5 earlier payments)
  sends.forEach((p, i) => {
    if (i < 5 || p.timestamp < now - 30 * DAY) return
    const med = median(sends.slice(0, i).map((s) => Number(s.amountRaw)))
    if (med > 0 && Number(p.amountRaw) > med * 3 && p.amountRaw >= 1_000_000n) {
      insights.push({ id: `large:${p.txHash}`, severity: 'warning', title: 'Larger than usual payment', detail: `${usdc(p.amountRaw)} USDC to ${short(p.recipient)} is more than 3 times your typical payment of ${usdc(BigInt(Math.round(med)))} USDC.`, txHash: p.txHash, address: p.recipient })
    }
  })

  // Possible duplicates: same recipient and amount within 10 minutes
  for (let i = 1; i < sends.length; i++) {
    const a = sends[i - 1]
    const b = sends[i]
    if (b.timestamp >= now - 30 * DAY && a.recipient === b.recipient && a.amountRaw === b.amountRaw && b.timestamp - a.timestamp <= 600) {
      insights.push({ id: `dup:${b.txHash}`, severity: 'warning', title: 'Possible duplicate payment', detail: `${usdc(b.amountRaw)} USDC went to ${short(b.recipient)} twice within ${Math.max(1, Math.round((b.timestamp - a.timestamp) / 60))} minutes.`, txHash: b.txHash, address: b.recipient })
    }
  }

  // Payments that repeat at regular intervals: a good candidate for a recurring schedule
  const groups = new Map<string, Payment[]>()
  for (const p of sends) {
    const key = `${p.recipient.toLowerCase()}:${p.amountRaw}`
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  for (const [key, list] of groups) {
    if (list.length < 3) continue
    const gaps = list.slice(1).map((p, i) => p.timestamp - list[i].timestamp)
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length
    if (mean >= 3600 && (Math.max(...gaps) - Math.min(...gaps)) / mean <= 0.25) {
      const last = list[list.length - 1]
      insights.push({ id: `recurring:${key}`, severity: 'info', title: 'This looks like a recurring payment', detail: `${list.length} payments of ${usdc(last.amountRaw)} USDC to ${short(last.recipient)}, about every ${Math.max(1, Math.round(mean / DAY))} day(s). Recurring Payments can run this automatically.`, address: last.recipient })
    }
  }

  // Concentration of the last 30 days of outgoing volume
  const recent = sends.filter((p) => p.timestamp >= now - 30 * DAY)
  const total = recent.reduce((s, p) => s + p.amountRaw, 0n)
  if (recent.length >= 3 && total > 0n) {
    const byRecipient = new Map<string, bigint>()
    for (const p of recent) byRecipient.set(p.recipient, (byRecipient.get(p.recipient) ?? 0n) + p.amountRaw)
    const [top, volume] = [...byRecipient.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1))[0]
    const share = (Number(volume) / Number(total)) * 100
    if (share > 60) insights.push({ id: `concentration:${top}`, severity: 'info', title: 'Most of your spending goes to one address', detail: `${share.toFixed(0)}% of the USDC you sent in the last 30 days went to ${short(top)}.`, address: top as Address })
  }

  const totals = new Map<string, CategoryTotal>()
  for (const p of sends) {
    for (const tag of tagsOf(p.note)) {
      const row = totals.get(tag) ?? { tag, sent: 0n, count: 0 }
      row.sent += p.amountRaw
      row.count++
      totals.set(tag, row)
    }
  }
  const categories = [...totals.values()].sort((a, b) => (b.sent > a.sent ? 1 : b.sent < a.sent ? -1 : 0)).slice(0, 8)

  insights.sort((a, b) => RANK[a.severity] - RANK[b.severity])
  return { insights, categories }
}
