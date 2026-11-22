import { useEffect, useState } from 'react'
import { BackButton } from '@/components/PageHeader'
import { ReportsExport } from '@/components/ReportsExport'
import { ReportsReminders } from '@/components/ReportsReminders'

type Tab = 'export' | 'reminders'

const TABS: { id: Tab; label: string }[] = [
  { id: 'export', label: 'Export statement' },
  { id: 'reminders', label: 'Payment reminders' },
]

/** Reporting dialog: structured statement exports and calendar reminders. */
export function ReportsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('export')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="anim-enter fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reports-title"
        className="glass pop-in relative max-h-[92dvh] w-full max-w-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5">
          <BackButton onClick={onClose} />
        </div>
        <div className="p-5">
          <h2 id="reports-title" className="text-lg font-semibold">
            Reports &amp; reminders
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Download a structured statement or put a payment date in your calendar.
          </p>

          <div role="tablist" aria-label="Reports" className="mt-4 inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border)' }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150"
                style={{ background: tab === t.id ? 'rgba(79,140,255,0.25)' : 'transparent', color: tab === t.id ? '#cfe0ff' : 'var(--muted)' }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-5" role="tabpanel">
            {tab === 'export' ? <ReportsExport /> : <ReportsReminders />}
          </div>
        </div>
      </div>
    </div>
  )
}
