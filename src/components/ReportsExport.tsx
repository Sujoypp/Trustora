import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useApp } from '@/lib/appContext'
import { downloadBlob } from '@/lib/download'
import { formatUsdc } from '@/lib/format'
import { buildRows, statementCsv, statementPdf } from '@/lib/statement'
import { NETWORK_NAME } from '@/lib/trustora'

type Range = '7' | '30' | '90' | 'year' | 'all'
type Direction = 'all' | 'sent' | 'received'
type Format = 'csv' | 'pdf' | 'json'

const RANGES: { id: Range; label: string }[] = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
]

function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <fieldset>
      <legend className="eyebrow mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150"
            style={{
              borderColor: value === o.id ? 'rgba(79,140,255,0.6)' : 'var(--border)',
              background: value === o.id ? 'rgba(79,140,255,0.2)' : 'transparent',
              color: value === o.id ? '#cfe0ff' : 'var(--muted)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Structured statement export: pick a period, direction and format. */
export function ReportsExport() {
  const { address, history } = useApp()
  const [range, setRange] = useState<Range>('30')
  const [direction, setDirection] = useState<Direction>('all')
  const [format, setFormat] = useState<Format>('pdf')
  // Fixed when the dialog opens, so the period does not shift while it is open.
  const [openedAt] = useState(() => Date.now())

  const selected = useMemo(() => {
    const nowSec = Math.floor(openedAt / 1000)
    const since =
      range === 'all' ? 0 : range === 'year' ? Math.floor(new Date(new Date(openedAt).getFullYear(), 0, 1).getTime() / 1000) : nowSec - Number(range) * 86_400
    return history.payments.filter((p) => p.timestamp >= since && (direction === 'all' || p.direction === direction))
  }, [history.payments, range, direction, openedAt])

  const totals = useMemo(() => {
    let received = 0n
    let sent = 0n
    for (const p of selected) {
      if (p.direction === 'received') received += p.amountRaw
      else if (p.direction === 'sent') sent += p.amountRaw
    }
    return { received, sent }
  }, [selected])

  const run = () => {
    if (!address) return
    const day = new Date().toISOString().slice(0, 10)
    const rows = buildRows(selected)
    if (format === 'csv') {
      downloadBlob(new Blob(['\uFEFF', statementCsv(rows)], { type: 'text/csv;charset=utf-8' }), `trustora-statement-${day}.csv`)
    } else if (format === 'pdf') {
      downloadBlob(statementPdf(rows, selected, address), `trustora-statement-${day}.pdf`)
    } else {
      const doc = {
        generatedAt: new Date().toISOString(),
        network: NETWORK_NAME,
        wallet: address,
        period: RANGES.find((r) => r.id === range)?.label,
        direction,
        summary: { payments: selected.length, receivedUsdc: formatUsdc(totals.received, 6), sentUsdc: formatUsdc(totals.sent, 6) },
        payments: rows,
      }
      downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `trustora-statement-${day}.json`)
    }
  }

  return (
    <div className="space-y-5">
      <Choice label="Period" value={range} onChange={setRange} options={RANGES} />
      <Choice
        label="Payments"
        value={direction}
        onChange={setDirection}
        options={[
          { id: 'all', label: 'All' },
          { id: 'sent', label: 'Sent' },
          { id: 'received', label: 'Received' },
        ]}
      />
      <Choice
        label="Format"
        value={format}
        onChange={setFormat}
        options={[
          { id: 'pdf', label: 'PDF statement' },
          { id: 'csv', label: 'CSV (spreadsheet)' },
          { id: 'json', label: 'JSON (structured)' },
        ]}
      />

      <dl className="glass-inner grid grid-cols-3 gap-2 p-3 text-center text-sm">
        <div>
          <dt className="eyebrow">Payments</dt>
          <dd className="mt-1 font-semibold tabular-nums">{selected.length}</dd>
        </div>
        <div>
          <dt className="eyebrow">Received</dt>
          <dd className="mt-1 font-semibold tabular-nums" style={{ color: 'var(--emerald)' }}>
            +{formatUsdc(totals.received)}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Sent</dt>
          <dd className="mt-1 font-semibold tabular-nums">-{formatUsdc(totals.sent)}</dd>
        </div>
      </dl>

      <button type="button" onClick={run} disabled={!address || selected.length === 0} className="cta flex min-h-11 w-full items-center justify-center gap-2 text-sm font-semibold">
        <Download className="size-4" aria-hidden="true" />
        {selected.length === 0 ? 'No payments in this period' : `Download ${format.toUpperCase()}`}
      </button>
    </div>
  )
}
