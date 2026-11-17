import { useState } from 'react'
import { CalendarPlus, ExternalLink, Trash2 } from 'lucide-react'
import { useApp } from '@/lib/appContext'
import { downloadBlob } from '@/lib/download'
import { buildIcs, googleCalendarUrl, type Reminder } from '@/lib/ics'
import { useReminders } from '@/lib/reminders'

const AMOUNT_RE = /^\d{0,9}(\.\d{0,6})?$/
const inputClass = 'glass-inner min-h-10 w-full bg-transparent px-3 text-sm outline-none placeholder:text-[var(--subtle)]'

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const downloadIcs = (r: Reminder) =>
  downloadBlob(new Blob([buildIcs(r)], { type: 'text/calendar;charset=utf-8' }), `trustora-reminder-${r.id}.ics`)

/** Payment reminders: save one and add it to Apple, Outlook or Google Calendar. */
export function ReportsReminders() {
  const { address } = useApp()
  const { reminders, add, remove } = useReminders(address)
  const [title, setTitle] = useState('Pay invoice')
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
  const [time, setTime] = useState('09:00')

  const dueAt = new Date(`${date}T${time}`).getTime()
  const valid = title.trim().length > 0 && Number.isFinite(dueAt)
  const draft = (): Omit<Reminder, 'id'> => ({ title: title.trim(), payee: payee.trim(), amount, note: note.trim(), dueAt })

  const save = (after: (r: Reminder) => void) => {
    if (!valid || !address) return
    after(add(draft()))
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="eyebrow mb-1.5 block">Reminder</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={inputClass} placeholder="Pay invoice" />
        </label>
        <label className="block">
          <span className="eyebrow mb-1.5 block">Pay to (optional)</span>
          <input value={payee} onChange={(e) => setPayee(e.target.value)} maxLength={64} className={inputClass} placeholder="Wallet address or name" />
        </label>
        <label className="block">
          <span className="eyebrow mb-1.5 block">Amount in USDC (optional)</span>
          <input
            value={amount}
            onChange={(e) => AMOUNT_RE.test(e.target.value) && setAmount(e.target.value)}
            inputMode="decimal"
            className={`${inputClass} tabular-nums`}
            placeholder="0.00"
          />
        </label>
        <label className="block">
          <span className="eyebrow mb-1.5 block">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="eyebrow mb-1.5 block">Time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="eyebrow mb-1.5 block">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} className={inputClass} placeholder="Invoice number, terms..." />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={!valid || !address} onClick={() => save(downloadIcs)} className="cta flex min-h-11 items-center justify-center gap-2 text-sm font-semibold">
          <CalendarPlus className="size-4" aria-hidden="true" />
          Add to calendar (.ics)
        </button>
        <button
          type="button"
          disabled={!valid || !address}
          onClick={() => save((r) => window.open(googleCalendarUrl(r), '_blank', 'noopener,noreferrer'))}
          className="ghost-btn flex min-h-11 items-center justify-center gap-2 border text-sm font-medium disabled:opacity-40"
          style={{ borderColor: 'var(--border)' }}
        >
          Google Calendar
          <ExternalLink className="size-4" aria-hidden="true" />
        </button>
      </div>
      {!address && (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Connect your wallet to save reminders.
        </p>
      )}

      {reminders.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Saved reminders</p>
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li key={r.id} className="glass-inner flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                    {when(r.dueAt)}
                    {r.amount && ` · ${r.amount} USDC`}
                    {r.payee && ` · ${r.payee}`}
                  </span>
                </span>
                <button type="button" onClick={() => downloadIcs(r)} className="ghost-btn border px-2.5 py-1.5 text-xs font-medium" style={{ borderColor: 'var(--border)' }}>
                  .ics
                </button>
                <a
                  href={googleCalendarUrl(r)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ghost-btn border px-2.5 py-1.5 text-xs font-medium"
                  style={{ borderColor: 'var(--border)' }}
                >
                  Google
                </a>
                <button type="button" onClick={() => remove(r.id)} aria-label={`Delete ${r.title}`} className="flex size-8 items-center justify-center rounded-lg hover:bg-white/10" style={{ color: 'var(--muted)' }}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
