import type { Address } from 'viem'
import { InvoiceStatus, MilestoneState } from '@/lib/contracts'
import type { Deal, InvoiceRow, ScheduleRow } from '@/hooks/useTrustoraData'
import type { Payment } from '@/lib/trustora'

export interface AppNotification {
  /** Stable id. Items that ask for an action include the state, so they reappear only when something new happens. */
  id: string
  kind: 'payment' | 'escrow' | 'invoice' | 'schedule'
  title: string
  detail: string
  /** The screen that handles it. */
  to: string
  /** Unix seconds when the event happened, when the chain gives us a time. */
  at?: number
  /** True when you need to do something. */
  action: boolean
}

interface Input {
  me?: Address
  payments: Payment[]
  deals: Deal[]
  invoices: InvoiceRow[]
  schedules: ScheduleRow[]
  now: number
}

const DAY = 86_400
const usdc = (raw: bigint) => (Number(raw) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Builds the notification list from real chain data you already load: payments, deals, invoices and schedules. */
export function deriveNotifications({ me, payments, deals, invoices, schedules, now }: Input): AppNotification[] {
  if (!me) return []
  const out: AppNotification[] = []

  for (const p of payments) {
    if (p.status === 'confirmed' && p.direction === 'received' && p.timestamp >= now - 14 * DAY) {
      out.push({ id: `pay:${p.txHash}:${p.logIndex}`, kind: 'payment', title: 'Payment received', detail: `${usdc(p.amountRaw)} USDC from ${short(p.sender)}`, to: '/history', at: p.timestamp, action: false })
    }
  }

  for (const { id, agreement: a, milestones } of deals) {
    const isPayer = same(a.payer, me)
    const isPayee = same(a.payee, me)
    const isArbiter = a.arbiter !== '0x0000000000000000000000000000000000000000' && same(a.arbiter, me)
    const n = `#${id.toString()}`
    if (isPayee && !a.accepted && !a.cancelled) {
      out.push({ id: `deal:${id}:accept`, kind: 'escrow', title: `Agreement ${n} needs your acceptance`, detail: `${usdc(a.total)} USDC is held for you. Accept or decline.`, to: '/escrow', at: Number(a.createdAt), action: true })
    }
    milestones.forEach((m, i) => {
      const label = `${n}${milestones.length > 1 ? ` milestone ${i + 1}` : ''}`
      if (isPayer && m.state === MilestoneState.Delivered) out.push({ id: `deal:${id}:${i}:review`, kind: 'escrow', title: `${label} was delivered`, detail: `Review and release ${usdc(m.amount)} USDC.`, to: '/escrow', at: Number(m.deliveredAt), action: true })
      if (isArbiter && m.state === MilestoneState.Disputed) out.push({ id: `deal:${id}:${i}:dispute`, kind: 'escrow', title: `${label} is disputed`, detail: 'The arbiter decision is needed.', to: '/escrow', at: Number(m.stateAt), action: true })
      if ((isPayer || isPayee) && m.state === MilestoneState.Unclaimed) out.push({ id: `deal:${id}:${i}:claim`, kind: 'escrow', title: `${label} has a payout to claim`, detail: 'A transfer could not be completed. Claim it when you can.', to: '/escrow', at: Number(m.stateAt), action: true })
      if (isPayer && m.state === MilestoneState.Funded && a.accepted && m.dueAt !== 0n && BigInt(now) > m.dueAt) out.push({ id: `deal:${id}:${i}:late`, kind: 'escrow', title: `${label} missed its deadline`, detail: `You can reclaim ${usdc(m.amount)} USDC.`, to: '/escrow', at: Number(m.dueAt), action: true })
      if (isPayee && m.state === MilestoneState.Delivered && a.autoReleaseAfter !== 0n && BigInt(now) >= m.deliveredAt + a.autoReleaseAfter) out.push({ id: `deal:${id}:${i}:auto`, kind: 'escrow', title: `${label} can be released to you`, detail: 'The auto-release window has passed.', to: '/escrow', at: Number(m.deliveredAt + a.autoReleaseAfter), action: true })
    })
  }

  for (const { id, invoice: inv } of invoices) {
    if (same(inv.issuer, me) && inv.status === InvoiceStatus.Paid) out.push({ id: `inv:${id}:paid`, kind: 'invoice', title: `Invoice #${id.toString()} was paid`, detail: `${usdc(inv.amount)} USDC from ${short(inv.paidBy)}`, to: '/invoices', at: Number(inv.paidAt), action: false })
    const payable = inv.status === InvoiceStatus.Open && !same(inv.issuer, me) && (inv.payer === '0x0000000000000000000000000000000000000000' ? false : same(inv.payer, me))
    if (payable) {
      const overdue = inv.dueAt !== 0n && BigInt(now) > inv.dueAt
      out.push({ id: `inv:${id}:due`, kind: 'invoice', title: overdue ? `Invoice #${id.toString()} is overdue` : `Invoice #${id.toString()} awaits your payment`, detail: `${usdc(inv.amount)} USDC to ${short(inv.issuer)}`, to: `/invoices?invoice=${id.toString()}`, at: Number(inv.createdAt), action: true })
    }
  }

  for (const { id, schedule: s } of schedules) {
    if (s.active && BigInt(now) >= s.nextAt && (same(s.payer, me) || same(s.payee, me))) {
      out.push({ id: `sched:${id}:${s.executed}`, kind: 'schedule', title: 'A scheduled payment is due', detail: `${usdc(s.amount)} USDC, payment ${s.executed + 1} of ${s.executed + s.remaining}.`, to: '/recurring', at: Number(s.nextAt), action: true })
    }
  }

  return out.sort((a, b) => Number(b.action) - Number(a.action) || (b.at ?? 0) - (a.at ?? 0))
}
