import { memo, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Hash, Scale } from 'lucide-react'
import { formatUsdc } from '@/lib/format'
import { MASK } from '@/lib/prefs'
import type { Payment } from '@/lib/trustora'

const W = 640
const H = 220
const PAD = { l: 8, r: 8, t: 14, b: 22 }
const DAY = 86_400

/** Smooth monotone curve through the points (no overshoot between samples). */
function curve(points: [number, number][]): string {
  const n = points.length
  if (n < 2) return ''
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0])
    m.push((points[i + 1][1] - points[i][1]) / dx[i])
  }
  const t = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]))
  t.push(m[n - 2])
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${(points[i][0] + h).toFixed(1)} ${(points[i][1] + t[i] * h).toFixed(1)} ${(points[i + 1][0] - h).toFixed(1)} ${(points[i + 1][1] - t[i + 1] * h).toFixed(1)} ${points[i + 1][0].toFixed(1)} ${points[i + 1][1].toFixed(1)}`
  }
  return d
}

const usd = (raw: number) => (raw / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
const dayLabel = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

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

interface Props {
  payments: Payment[]
  balanceRaw?: bigint
  hideBalance: boolean
}

/** Real analytics from your confirmed payments: a balance trend, weekly cash flow and 30-day totals. */
export const AnalyticsPanel = memo(function AnalyticsPanel({ payments, balanceRaw, hideBalance }: Props) {
  const [now] = useState(() => Math.floor(Date.now() / 1000))
  const [hover, setHover] = useState<number | null>(null)

  const data = useMemo(() => {
    const flows = payments.filter((p) => p.direction !== 'self').sort((a, b) => a.timestamp - b.timestamp || Number(a.blockNumber - b.blockNumber))
    const net = flows.reduce((s, p) => s + (p.direction === 'received' ? Number(p.amountRaw) : -Number(p.amountRaw)), 0)
    const end = balanceRaw !== undefined ? Number(balanceRaw) : null
    const series: { ts: number; value: number }[] = []
    if (flows.length > 0 && end !== null) {
      let run = end - net
      series.push({ ts: flows[0].timestamp - 1, value: run })
      for (const p of flows) {
        run += p.direction === 'received' ? Number(p.amountRaw) : -Number(p.amountRaw)
        series.push({ ts: p.timestamp, value: run })
      }
    }
    const weeks = Array.from({ length: 8 }, (_, i) => ({ start: now - (7 - i) * 7 * DAY - (now % DAY), received: 0, sent: 0 }))
    let received30 = 0
    let sent30 = 0
    for (const p of flows) {
      const amount = Number(p.amountRaw)
      const incoming = p.direction === 'received'
      if (p.timestamp >= now - 30 * DAY) {
        if (incoming) received30 += amount
        else sent30 += amount
      }
      const w = weeks.find((wk) => p.timestamp >= wk.start && p.timestamp < wk.start + 7 * DAY)
      if (w) {
        if (incoming) w.received += amount
        else w.sent += amount
      }
    }
    return { flows, series, weeks, received30, sent30 }
  }, [payments, balanceRaw, now])

  // Balance trend geometry
  const vals = data.series.map((s) => s.value)
  const lo = Math.min(...vals, 0)
  const hi = Math.max(...vals, 1)
  const span = hi - lo || 1
  const x = (i: number) => PAD.l + (i / Math.max(1, vals.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b)
  const pts: [number, number][] = vals.map((v, i) => [x(i), y(v)])
  const line = curve(pts)
  const area = line && `${line} L${x(vals.length - 1).toFixed(1)} ${H - PAD.b} L${x(0).toFixed(1)} ${H - PAD.b} Z`
  const active = hover ?? (vals.length ? vals.length - 1 : null)

  const maxWeek = Math.max(1, ...data.weeks.flatMap((w) => [w.received, w.sent]))

  return (
    <section aria-label="Analytics" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={ArrowDownLeft} label="Received, 30 days" value={hideBalance ? MASK : `${usd(data.received30)} USDC`} tone="#34d399" />
        <Kpi icon={ArrowUpRight} label="Sent, 30 days" value={hideBalance ? MASK : `${usd(data.sent30)} USDC`} tone="#4f8cff" />
        <Kpi icon={Scale} label="Net, 30 days" value={hideBalance ? MASK : `${data.received30 - data.sent30 >= 0 ? '+' : '-'}${usd(Math.abs(data.received30 - data.sent30))}`} tone="#22d3ee" />
        <Kpi icon={Hash} label="Payments" value={String(data.flows.length)} tone="#8b5cf6" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="glass p-5 lg:col-span-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="display text-base font-semibold">Balance trend</h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Built from your payments through Trustora, ending on your live balance.</p>
            </div>
            {active !== null && (
              <div className="text-right">
                <p className="display text-lg font-semibold tabular-nums">{hideBalance ? MASK : `${usd(vals[active])}`} <span className="text-xs" style={{ color: 'var(--muted)' }}>USDC</span></p>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>{dayLabel(data.series[active].ts)}</p>
              </div>
            )}
          </div>
          {line ? (
            <div className="chart-reveal mt-3">
              <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-pan-y" role="img" aria-label="Balance trend chart" onPointerLeave={() => setHover(null)} onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                const rel = ((e.clientX - r.left) / r.width) * W
                setHover(Math.max(0, Math.min(vals.length - 1, Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (vals.length - 1)))))
              }}>
                <defs>
                  <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop stopColor="#4f8cff" stopOpacity="0.38" />
                    <stop offset="1" stopColor="#4f8cff" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="trend-line" x1="0" y1="0" x2="1" y2="0">
                    <stop stopColor="#4f8cff" />
                    <stop offset="1" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
                {[0, 1, 2, 3].map((i) => (
                  <line key={i} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + (i / 3) * (H - PAD.t - PAD.b)} y2={PAD.t + (i / 3) * (H - PAD.t - PAD.b)} stroke="rgba(150,190,255,0.1)" strokeDasharray="3 5" />
                ))}
                <path d={area} fill="url(#trend-fill)" />
                <path d={line} stroke="url(#trend-line)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                {active !== null && (
                  <g>
                    <line x1={pts[active][0]} x2={pts[active][0]} y1={PAD.t} y2={H - PAD.b} stroke="rgba(150,190,255,0.3)" />
                    <circle cx={pts[active][0]} cy={pts[active][1]} r="4.5" fill="#04101f" stroke="#22d3ee" strokeWidth="2" />
                  </g>
                )}
              </svg>
            </div>
          ) : (
            <div className="mt-4 flex h-[180px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-medium">No balance history yet</p>
              <p className="max-w-xs text-xs" style={{ color: 'var(--muted)' }}>The trend appears after your first confirmed payment through Trustora.</p>
            </div>
          )}
        </div>

        <div className="glass p-5 lg:col-span-2">
          <h2 className="display text-base font-semibold">Weekly cash flow</h2>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Last 8 weeks, USDC received and sent.</p>
          <div className="mt-4 flex h-[168px] items-end gap-1.5" role="img" aria-label="Weekly cash flow bars">
            {data.weeks.map((w) => (
              <div key={w.start} className="flex h-full flex-1 flex-col justify-end gap-1">
                <div className="flex flex-1 items-end justify-center gap-[3px]">
                  <span className="w-full max-w-[12px] rounded-t-sm" style={{ height: `${Math.max(w.received ? 4 : 0, (w.received / maxWeek) * 100)}%`, background: 'linear-gradient(#34d399, rgba(52,211,153,0.35))' }} title={`Received ${usd(w.received)} USDC`} />
                  <span className="w-full max-w-[12px] rounded-t-sm" style={{ height: `${Math.max(w.sent ? 4 : 0, (w.sent / maxWeek) * 100)}%`, background: 'linear-gradient(#4f8cff, rgba(79,140,255,0.35))' }} title={`Sent ${usd(w.sent)} USDC`} />
                </div>
                <span className="text-center text-[10px]" style={{ color: 'var(--subtle)' }}>{dayLabel(w.start)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs" style={{ color: 'var(--muted)' }}>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: '#34d399' }} />Received</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: '#4f8cff' }} />Sent</span>
          </div>
        </div>
      </div>
    </section>
  )
})
