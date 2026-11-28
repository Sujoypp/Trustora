import { ArrowRight, Loader2 } from 'lucide-react'
import type { Address } from 'viem'
import { useChainBalances } from '@/hooks/useChainBalances'
import { formatUsdc } from '@/lib/format'
import { MASK } from '@/lib/prefs'
import { navigate } from '@/lib/router'

/** USDC held on each chain CCTP connects to Arc. The main balance above is Arc only; the rest can be bridged in. */
export function ChainBreakdown({ owner, hideBalance }: { owner: Address | undefined; hideBalance: boolean }) {
  const { data, isLoading } = useChainBalances(owner, true)
  const rows = data ?? []
  const known = rows.filter((r) => r.raw !== null)
  const total = known.reduce((sum, r) => sum + (r.raw ?? 0n), 0n)
  const elsewhere = rows.some((r) => r.id !== 5042 && r.raw !== null && r.raw > 0n)

  return (
    <div className="glass-inner space-y-3 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">USDC by chain</p>
        {known.length > 0 && (
          <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            Across {known.length} chains: <span style={{ color: 'var(--ink)' }}>{hideBalance ? MASK : formatUsdc(total)} USDC</span>
          </p>
        )}
      </div>
      {isLoading && (
        <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading balances...
        </p>
      )}
      <ul className="space-y-2">
        {rows.map((r) => {
          const share = r.raw !== null && total > 0n ? Number((r.raw * 1000n) / total) / 10 : 0
          return (
            <li key={r.id} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium" style={{ color: r.id === 5042 ? '#9fe9f5' : 'var(--ink)' }}>
                  {r.label}
                </span>
                <span className="tabular-nums" style={{ color: r.raw === null ? 'var(--amber)' : 'var(--ink)' }}>
                  {r.raw === null ? 'Unavailable' : hideBalance ? MASK : `${formatUsdc(r.raw)} USDC`}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${share}%`, background: r.id === 5042 ? '#22d3ee' : '#6366f1' }} />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-xs" style={{ color: 'var(--subtle)' }}>
        Read from each chain&apos;s public RPC, so a chain may show Unavailable when its endpoint is busy. Only Arc Mainnet USDC counts toward your balance above.
      </p>
      {elsewhere && (
        <button type="button" onClick={() => navigate('/bridge')} className="ghost-btn flex min-h-10 items-center gap-2 border px-4 text-sm font-semibold" style={{ borderColor: 'rgba(34,211,238,0.4)', color: '#9fe9f5' }}>
          Bridge USDC to Arc <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
