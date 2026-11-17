import { useDeferredValue, useMemo, useState } from 'react'
import { AnimatePresence } from '@/lib/motion'
import { ConnectKitButton } from 'connectkit'
import { CalendarClock, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { PaymentFilterBar } from '@/components/PaymentFilterBar'
import { usePaymentFilters } from '@/hooks/usePaymentFilters'
import { applyFilters, topTags } from '@/lib/paymentFilters'
import { PageHeader } from '@/components/PageHeader'
import { ReportsModal } from '@/components/ReportsModal'
import { Empty, PaymentRow, SyncNotice, mergePayments } from '@/components/ActivityFeed'
import { useApp } from '@/lib/appContext'
import { downloadBlob } from '@/lib/download'
import { buildRows, statementCsv, statementPdf } from '@/lib/statement'
import { ROUTER_ADDRESS } from '@/lib/trustora'
import { formatUsdc } from '@/lib/format'
import { MASK } from '@/lib/prefs'

export function HistoryPage() {
  const { address, isConnected, history, pending, prefs } = useApp()
  const filterState = usePaymentFilters()
  const [reportsOpen, setReportsOpen] = useState(false)
  const deferredFilters = useDeferredValue(filterState.filters)

  const all = useMemo(() => mergePayments(history.payments, pending), [history.payments, pending])
  const tags = useMemo(() => topTags(all), [all])
  const shown = useMemo(
    () => applyFilters(all, deferredFilters),
    [all, deferredFilters],
  )

  let received = 0n
  let sent = 0n
  for (const p of history.payments) {
    if (p.direction === 'received') received += p.amountRaw
    else if (p.direction === 'sent') sent += p.amountRaw
  }
  const money = (raw: bigint) => (prefs.hideBalances ? MASK : formatUsdc(raw))

  const stamp = () => new Date().toISOString().slice(0, 10)
  const canExport = Boolean(address) && shown.length > 0

  const exportCsv = () => {
    if (!address) return
    const csv = statementCsv(buildRows(shown))
    downloadBlob(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), `trustora-history-${stamp()}.csv`)
  }
  const exportPdf = () => {
    if (!address) return
    downloadBlob(statementPdf(buildRows(shown), shown, address), `trustora-statement-${stamp()}.pdf`)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        actions={
          <>
            <button
              onClick={() => setReportsOpen(true)}
              className="ghost-btn flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
              style={{ borderColor: 'var(--border-hot)', color: 'var(--ink)' }}
            >
              <CalendarClock className="size-4" style={{ color: 'var(--accent)' }} />
              Reports &amp; reminders
            </button>
            <button
              onClick={exportCsv}
              disabled={!canExport}
              className="ghost-btn flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-40"
              style={{ borderColor: 'var(--border-hot)', color: 'var(--ink)' }}
            >
              <FileSpreadsheet className="size-4" style={{ color: 'var(--accent)' }} />
              Export CSV
            </button>
            <button
              onClick={exportPdf}
              disabled={!canExport}
              className="cta flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold"
            >
              <Download className="size-4" />
              Export PDF
            </button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Received" value={`+${money(received)}`} color="var(--emerald)" />
        <Stat label="Sent" value={`-${money(sent)}`} color="var(--accent)" />
        <Stat label="Payments" value={String(history.payments.length)} color="var(--gold)" />
      </div>

      <section className="glass rounded-xl p-5 sm:p-6" aria-label="Payment history">
        <PaymentFilterBar state={filterState} tags={tags} total={all.length} shown={shown.length} showDirection />

        <SyncNotice progress={history.progress} error={history.error} />

        {!isConnected ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Empty title="Connect your wallet" text="Your full payment history and reports appear here." />
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button onClick={show} className="cta min-h-12 rounded-full px-8 text-sm font-semibold">
                  Connect wallet
                </button>
              )}
            </ConnectKitButton.Custom>
          </div>
        ) : !ROUTER_ADDRESS ? (
          <Empty title="Contract not deployed yet" text="Payments made through Trustora will show up here once the contract is live." />
        ) : shown.length === 0 ? (
          history.isLoading && all.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="shimmer h-[72px] rounded-2xl" />
              ))}
            </div>
          ) : (
            <Empty
              title={all.length === 0 ? 'No payments yet' : 'Nothing matches'}
              text={all.length === 0 ? 'Send or receive a payment and it appears here the moment it confirms.' : 'Try a different filter or search.'}
            />
          )
        ) : (
          <>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {shown.map((p) => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </AnimatePresence>
            </ul>
            <p className="mt-4 flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
              <FileText className="size-3.5" />
              Exports include the {shown.length} payment{shown.length === 1 ? '' : 's'} shown above.
            </p>
          </>
        )}
      </section>
      {reportsOpen && <ReportsModal onClose={() => setReportsOpen(false)} />}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="eyebrow">{label}</p>
      <p className="display mt-1 truncate text-xl font-bold tabular-nums sm:text-2xl" style={{ color }}>
        {value}
      </p>
    </div>
  )
}
