import type { Payment, Rail } from '@/lib/trustora'

export interface PaymentFilters {
  query: string
  status: 'all' | 'confirmed' | 'pending'
  route: 'all' | Rail
  direction: 'all' | 'sent' | 'received'
  /** A memo tag such as "#invoice", lowercase. */
  tag: string | null
}

export const DEFAULT_FILTERS: PaymentFilters = { query: '', status: 'all', route: 'all', direction: 'all', tag: null }

const TAG_RE = /#[\p{L}\p{N}_-]{2,24}/gu

/** Memo tags written in a note, for example "#invoice" or "#rent-may". */
export function tagsOf(note: string): string[] {
  return [...new Set((note.match(TAG_RE) ?? []).map((t) => t.toLowerCase()))]
}

/** The most used memo tags across payments, most frequent first. */
export function topTags(payments: Payment[], max = 8): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of payments) for (const tag of tagsOf(p.note)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, max)
}

export function applyFilters(
  payments: Payment[],
  f: PaymentFilters,
): Payment[] {
  const q = f.query.trim().toLowerCase()
  return payments.filter((p) => {
    if (f.status !== 'all' && p.status !== f.status) return false
    if (f.route !== 'all' && p.rail !== f.route) return false
    if (f.direction === 'sent' && p.direction === 'received') return false
    if (f.direction === 'received' && p.direction === 'sent') return false
    if (f.tag && !tagsOf(p.note).includes(f.tag)) return false
    if (!q) return true
    const other = p.direction === 'received' ? p.sender : p.recipient
    return [p.note, other, p.txHash].some((v) => v.toLowerCase().includes(q))
  })
}

export function activeFilterCount(f: PaymentFilters): number {
  return [f.query.trim() !== '', f.status !== 'all', f.route !== 'all', f.direction !== 'all', f.tag !== null].filter(Boolean).length
}
