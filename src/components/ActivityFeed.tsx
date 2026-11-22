import { memo } from 'react'
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ExternalLink } from 'lucide-react'
import { EmptyState } from '@/components/states'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { useApp } from '@/lib/appContext'
import { formatUsdc, fullDate, shortAddress, timeAgo } from '@/lib/format'
import { paymentToReceipt } from '@/lib/receipt'
import { CHAIN_ID, type Payment } from '@/lib/trustora'
import type { HistoryProgress } from '@/hooks/usePaymentHistory'

export function StatusPill({ status }: { status: Payment['status'] }) {
  const confirmed = status === 'confirmed'
  return (
    <span className={`chip ${confirmed ? 'chip-ok' : 'chip-warn'}`}>
      {confirmed ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <span className="orbit-spinner size-3 rounded-full border-2" style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }} aria-hidden="true" />}
      {confirmed ? 'Confirmed' : 'Pending'}
    </span>
  )
}

/** Merges optimistic pending rows with confirmed history, hiding a pending row once its hash is confirmed. */
export function mergePayments(confirmed: Payment[], pending: Payment[]): Payment[] {
  const confirmedHashes = new Set(confirmed.map((p) => p.txHash))
  return [...pending.filter((p) => !confirmedHashes.has(p.txHash)), ...confirmed]
}

export function SyncNotice({ progress, error }: { progress: HistoryProgress | null; error: string | null }) {
  const remaining = progress ? progress.head - progress.scanned : 0n
  return (
    <>
      {remaining > 50n && progress && (
        <p className="mb-3 text-xs tabular-nums" style={{ color: 'var(--amber)' }}>
          Syncing history: {remaining.toString()} blocks left to scan (block {progress.scanned.toString()} of {progress.head.toString()}).
        </p>
      )}
      {error && (
        <p className="mb-3 text-xs" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      )}
    </>
  )
}

/** One payment as a list row. Confirmed rows open the digital receipt. */
export const PaymentRow = memo(function PaymentRow({ payment: p }: { payment: Payment }) {
  const { openReceipt } = useApp()
  const incoming = p.direction === 'received'
  const counterparty = incoming ? p.sender : p.recipient
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight
  const clickable = p.status === 'confirmed'

  return (
    <li className="glass-inner cv-row flex items-center gap-3 p-3">
      <button
        type="button"
        disabled={!clickable}
        onClick={() => openReceipt(paymentToReceipt(p))}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left disabled:cursor-default"
        aria-label={clickable ? 'Open receipt' : undefined}
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: incoming ? 'rgba(16,185,129,0.12)' : 'rgba(79,140,255,0.14)', color: incoming ? 'var(--emerald)' : '#a9c6ff' }}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {p.direction === 'self' ? 'To yourself' : `${incoming ? 'From' : 'To'} `}
            {p.direction !== 'self' && <span className="mono text-[13px]">{shortAddress(counterparty)}</span>}
            {p.note && <span style={{ color: 'var(--muted)' }}> · {p.note}</span>}
          </span>
          <span className="block text-xs" style={{ color: 'var(--subtle)' }} title={fullDate(p.timestamp)}>
            {timeAgo(p.timestamp)}
          </span>
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-sm font-semibold tabular-nums" style={{ color: incoming ? 'var(--emerald)' : 'var(--ink)' }}>
          {incoming ? '+' : p.direction === 'self' ? '' : '-'}
          {formatUsdc(p.amountRaw)}
        </span>
        <div className="flex items-center gap-1.5">
          <StatusPill status={p.status} />
          <a
            href={buildTxExplorerUrl(CHAIN_ID, p.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View transaction on the block explorer"
            className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
            style={{ color: 'var(--muted)' }}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </li>
  )
})

export function Empty({ title, text }: { title: string; text: string }) {
  return <EmptyState title={title} description={text} />
}
