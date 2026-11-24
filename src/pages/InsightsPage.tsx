import { useMemo } from 'react'
import { AlertTriangle, CalendarClock, Info, Lightbulb, Sparkles, Tags } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { TxLink } from '@/components/TxLink'
import { EmptyState, LoadingState } from '@/components/states'
import { useNow } from '@/hooks/useNow'
import { useApp } from '@/lib/appContext'
import { formatUsdc } from '@/lib/format'
import { buildInsights, type Severity } from '@/lib/insights'
import { MASK } from '@/lib/prefs'
import { navigate } from '@/lib/router'

const TONE: Record<Severity, { chip: string; label: string; icon: typeof Info }> = {
  warning: { chip: 'chip-warn', label: 'Review', icon: AlertTriangle },
  notice: { chip: 'chip-info', label: 'Notice', icon: Sparkles },
  info: { chip: 'chip-mute', label: 'Insight', icon: Lightbulb },
}

/** Transaction Intelligence: clear, rule-based findings computed only from your confirmed payments. */
export function InsightsPage() {
  const app = useApp()
  const now = useNow(60_000)
  const result = useMemo(() => buildInsights(app.history.payments, now), [app.history.payments, now])
  const hide = app.prefs.hideBalances
  const maxCategory = result.categories[0] ? Number(result.categories[0].sent) : 1

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader />
      {!app.isConnected ? (
        <EmptyState icon={Lightbulb} title="Connect your wallet" description="Insights are computed from your own payment history." />
      ) : app.history.isLoading && app.history.payments.length === 0 ? (
        <LoadingState label="Reading your payment history" />
      ) : (
        <div className="space-y-4">
          <section className="glass space-y-3 p-5 sm:p-6" aria-labelledby="ins-title">
            <div>
              <h2 id="ins-title" className="display text-lg font-semibold">What stands out</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                Plain rules over your own payments: new recipients, unusually large amounts, possible duplicates, payments that repeat, and concentration. Nothing is guessed, and nothing leaves your browser.
              </p>
            </div>
            {result.insights.length === 0 ? (
              <EmptyState icon={Sparkles} title="Nothing unusual" description={app.history.payments.length < 3 ? 'Make a few payments and TRUSTORA will start spotting patterns.' : 'Your recent payments look consistent. New findings appear here as they happen.'} />
            ) : (
              <ul className="space-y-2.5">
                {result.insights.map((i) => {
                  const tone = TONE[i.severity]
                  const Icon = tone.icon
                  return (
                    <li key={i.id} className="glass-inner space-y-2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`chip ${tone.chip}`}>
                          <Icon className="size-3.5" aria-hidden="true" />
                          {tone.label}
                        </span>
                        <p className="text-sm font-semibold">{i.title}</p>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>{hide ? i.detail.replace(/[\d,]+\.\d{2} USDC/g, `${MASK} USDC`) : i.detail}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                        {i.txHash && <TxLink hash={i.txHash} />}
                        {i.address && (
                          <button type="button" onClick={() => navigate(`/profile?address=${i.address}`)} className="underline underline-offset-2" style={{ color: '#a9c6ff' }}>
                            View wallet profile
                          </button>
                        )}
                        {i.id.startsWith('recurring:') && (
                          <button type="button" onClick={() => navigate('/recurring')} className="inline-flex items-center gap-1 underline underline-offset-2" style={{ color: '#a9c6ff' }}>
                            <CalendarClock className="size-3.5" aria-hidden="true" /> Set up Recurring Payments
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="glass space-y-3 p-5 sm:p-6" aria-labelledby="cat-title">
            <div>
              <h2 id="cat-title" className="display flex items-center gap-2 text-lg font-semibold">
                <Tags className="size-5" style={{ color: '#7aa9ff' }} aria-hidden="true" />
                Spending by tag
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Add tags like #rent or #software to a payment note and your outgoing USDC is grouped here.</p>
            </div>
            {result.categories.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No tagged payments yet.</p>
            ) : (
              <ul className="space-y-3">
                {result.categories.map((c) => (
                  <li key={c.tag}>
                    <span className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{c.tag}</span>
                      <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>{hide ? MASK : formatUsdc(c.sent)} USDC · {c.count} payment{c.count === 1 ? '' : 's'}</span>
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (Number(c.sent) / maxCategory) * 100)}%`, background: 'linear-gradient(90deg, #8b5cf6, #22d3ee)' }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
