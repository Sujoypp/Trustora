import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, BarChart3, Gauge, Hash, Maximize2, Scale, TrendingUp, Users } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, LoadingState } from '@/components/states'
import { SyncNotice } from '@/components/ActivityFeed'
import { useEscrowDeals, useInvoices, useSchedules, useSplits } from '@/hooks/useTrustoraData'
import { useNow } from '@/hooks/useNow'
import { useApp } from '@/lib/appContext'
import { computeAnalytics } from '@/lib/analytics'
import { ESCROW_ADDRESS, FLOWS_ADDRESS } from '@/lib/contracts'
import { formatUsdc, shortAddress } from '@/lib/format'
import { MASK } from '@/lib/prefs'
import { navigate } from '@/lib/router'

const WINDOWS = [
  { id: '7', label: '7 days', days: 7 },
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
] as const
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Hash; label: string; value: string; tone: string }) {
  return (
    <div className="glass-inner flex items-center gap-3 p-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${tone}22`, color: tone }}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p className="display truncate text-base font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

function Bars({ items, max }: { items: { label: string; a: number; b?: number }[]; max: number }) {
  return (
    <div className="flex h-[150px] items-end gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex h-full flex-1 flex-col justify-end gap-1">
          <div className="flex flex-1 items-end justify-center gap-[3px]">
            <span className="w-full max-w-[14px] rounded-t-sm" style={{ height: `${Math.max(it.a ? 4 : 0, (it.a / max) * 100)}%`, background: 'linear-gradient(#34d399, rgba(52,211,153,0.35))' }} />
            {it.b !== undefined && <span className="w-full max-w-[14px] rounded-t-sm" style={{ height: `${Math.max(it.b ? 4 : 0, (it.b / max) * 100)}%`, background: 'linear-gradient(#4f8cff, rgba(79,140,255,0.35))' }} />}
          </div>
          <span className="text-center text-[10px]" style={{ color: 'var(--subtle)' }}>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Advanced analytics from your confirmed Trustora payments and onchain records. Every number is computed from the chain. */
export function AnalyticsPage() {
  const app = useApp()
  const now = useNow(60_000)
  const [windowId, setWindowId] = useState<(typeof WINDOWS)[number]['id']>('30')
  const days = WINDOWS.find((w) => w.id === windowId)?.days ?? null
  const hide = app.prefs.hideBalances
  const a = useMemo(() => computeAnalytics(app.history.payments, now, days), [app.history.payments, now, days])
  const deals = useEscrowDeals(app.address)
  const invoices = useInvoices(app.address)
  const schedules = useSchedules(app.address)
  const splits = useSplits(app.address)

  const usd = (raw: bigint) => (hide ? MASK : formatUsdc(raw))
  const monthMax = Math.max(1, ...a.months.flatMap((m) => [Number(m.received), Number(m.sent)]))
  const weekdayMax = Math.max(1, ...a.weekdays)
  const railTotal = a.rails.native + a.rails.erc20
  const topVolume = a.counterparties[0] ? Number(a.counterparties[0].volume) : 1
  const circumference = 2 * Math.PI * 28
  const nativeShare = railTotal ? a.rails.native / railTotal : 0

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader />
      {!app.isConnected ? (
        <EmptyState icon={BarChart3} title="Connect your wallet" description="Analytics are built from your own payments, so connect the wallet you use with TRUSTORA." />
      ) : app.history.isLoading && app.history.payments.length === 0 ? (
        <LoadingState label="Loading your payment history" />
      ) : (
        <div className="space-y-4">
          <SyncNotice progress={app.history.progress} error={app.history.error} />
          <div role="radiogroup" aria-label="Period" className="inline-flex rounded-xl border p-0.5" style={{ borderColor: 'var(--border)' }}>
            {WINDOWS.map((w) => (
              <button key={w.id} type="button" role="radio" aria-checked={windowId === w.id} onClick={() => setWindowId(w.id)} className="min-h-9 rounded-lg px-3.5 text-xs font-semibold transition-colors duration-150" style={{ background: windowId === w.id ? 'rgba(79,140,255,0.25)' : 'transparent', color: windowId === w.id ? '#e4eeff' : 'var(--muted)' }}>
                {w.label}
              </button>
            ))}
          </div>

          {a.count === 0 && app.history.payments.length === 0 ? (
            <EmptyState icon={BarChart3} title="No payments to analyze yet" description="Once you send or receive USDC through TRUSTORA, your cash flow, counterparties and habits appear here." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi icon={ArrowUpRight} label="Sent" value={`${usd(a.sent)} USDC`} tone="#4f8cff" />
                <Kpi icon={ArrowDownLeft} label="Received" value={`${usd(a.received)} USDC`} tone="#34d399" />
                <Kpi icon={Scale} label="Net flow" value={hide ? MASK : `${a.net >= 0n ? '+' : '-'}${formatUsdc(a.net >= 0n ? a.net : -a.net)} USDC`} tone="#22d3ee" />
                <Kpi icon={Hash} label="Payments" value={`${a.count} (${a.sentCount} out, ${a.receivedCount} in)`} tone="#8b5cf6" />
                <Kpi icon={Gauge} label="Average payment" value={`${usd(a.average)} USDC`} tone="#4f8cff" />
                <Kpi icon={Maximize2} label="Largest payment" value={`${usd(a.largest)} USDC`} tone="#f5b544" />
                <Kpi icon={TrendingUp} label="Volume vs previous period" value={a.volumeChangePct === null ? 'Not comparable' : `${a.volumeChangePct >= 0 ? '+' : ''}${a.volumeChangePct.toFixed(0)}%`} tone="#34d399" />
                <Kpi icon={Users} label="Counterparties" value={String(a.counterparties.length === 6 ? '6+' : a.counterparties.length)} tone="#22d3ee" />
              </div>

              <div className="grid gap-4 lg:grid-cols-5">
                <section className="glass p-5 lg:col-span-3" aria-label="Monthly cash flow">
                  <h2 className="display text-base font-semibold">Monthly cash flow</h2>
                  <p className="mb-4 mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Last 6 months, received and sent.</p>
                  <Bars items={a.months.map((m) => ({ label: m.label, a: Number(m.received), b: Number(m.sent) }))} max={monthMax} />
                  <div className="mt-3 flex gap-4 text-xs" style={{ color: 'var(--muted)' }}>
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: '#34d399' }} />Received</span>
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: '#4f8cff' }} />Sent</span>
                  </div>
                </section>

                <section className="glass p-5 lg:col-span-2" aria-label="Payment rail">
                  <h2 className="display text-base font-semibold">How you pay</h2>
                  <p className="mb-4 mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Native USDC against USDC (ERC-20) transfers.</p>
                  <div className="flex items-center gap-5">
                    <svg viewBox="0 0 72 72" className="size-24 shrink-0 -rotate-90" role="img" aria-label="Payment rail split">
                      <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(79,140,255,0.5)" strokeWidth="9" />
                      <circle cx="36" cy="36" r="28" fill="none" stroke="#22d3ee" strokeWidth="9" strokeDasharray={`${circumference * nativeShare} ${circumference}`} />
                    </svg>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: '#22d3ee' }} />Native USDC <span className="tabular-nums" style={{ color: 'var(--muted)' }}>{a.rails.native}</span></li>
                      <li className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: 'rgba(79,140,255,0.8)' }} />USDC (ERC-20) <span className="tabular-nums" style={{ color: 'var(--muted)' }}>{a.rails.erc20}</span></li>
                    </ul>
                  </div>
                </section>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="glass p-5" aria-label="Top counterparties">
                  <h2 className="display text-base font-semibold">Top counterparties</h2>
                  <p className="mb-3 mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>By total volume in this period. Select one to see their trust profile.</p>
                  {a.counterparties.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>No payments in this period.</p>
                  ) : (
                    <ul className="space-y-3">
                      {a.counterparties.map((c) => (
                        <li key={c.address}>
                          <button type="button" onClick={() => navigate(`/profile?address=${c.address}`)} className="w-full text-left">
                            <span className="flex items-center justify-between gap-3 text-sm">
                              <span className="mono">{shortAddress(c.address)}</span>
                              <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>{usd(c.volume)} USDC · {c.count}x</span>
                            </span>
                            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (Number(c.volume) / topVolume) * 100)}%`, background: 'linear-gradient(90deg, #4f8cff, #22d3ee)' }} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="glass p-5" aria-label="Weekday activity">
                  <h2 className="display text-base font-semibold">Busiest days</h2>
                  <p className="mb-4 mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Number of payments by weekday (UTC).</p>
                  <Bars items={a.weekdays.map((count, i) => ({ label: WEEKDAYS[i], a: count }))} max={weekdayMax} />
                </section>
              </div>
            </>
          )}

          <section className="glass p-5" aria-label="Tool usage">
            <h2 className="display text-base font-semibold">Onchain tools</h2>
            <p className="mb-3 mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Records tied to your wallet in the Escrow and Flows contracts.</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Escrow deals', configured: Boolean(ESCROW_ADDRESS), n: deals.data?.length, loading: deals.isPending },
                { label: 'Invoices', configured: Boolean(FLOWS_ADDRESS), n: invoices.data?.length, loading: invoices.isPending },
                { label: 'Recurring schedules', configured: Boolean(FLOWS_ADDRESS), n: schedules.data?.length, loading: schedules.isPending },
                { label: 'Split payments', configured: Boolean(FLOWS_ADDRESS), n: splits.data?.length, loading: splits.isPending },
              ].map((t) => (
                <div key={t.label} className="glass-inner p-3.5">
                  <p className="eyebrow">{t.label}</p>
                  <p className="display mt-1 text-xl font-semibold tabular-nums">{!t.configured ? 'Not set up' : t.loading ? '...' : (t.n ?? 0)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
