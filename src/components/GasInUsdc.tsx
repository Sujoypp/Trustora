import { Fuel } from 'lucide-react'
import { formatFeeUsdc } from '@/lib/format'

interface Props {
  /** Current network fee estimate in USDC (6-decimal view), when known. */
  feeUsdc?: bigint
  loading?: boolean
}

/**
 * Network gas on Arc is paid in USDC natively, so this switch is always on. It is shown as a locked toggle
 * with the live fee estimate; no paymaster (such as Circle Paymaster) is involved or needed.
 */
export function GasInUsdc({ feeUsdc, loading }: Props) {
  return (
    <div className="glass-inner flex items-center justify-between gap-3 p-3.5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Fuel className="size-4 shrink-0" style={{ color: '#a5b4fc' }} aria-hidden="true" />
          Pay network gas in USDC
          <span className="tabular-nums" style={{ color: 'var(--emerald)' }}>
            {loading ? 'Estimating...' : feeUsdc !== undefined ? `~${formatFeeUsdc(feeUsdc)} USDC` : 'Fee shown once you enter an amount'}
          </span>
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
          Always on: Arc&apos;s native gas token is USDC, so no Paymaster is needed.
        </p>
      </div>
      <span
        role="switch"
        aria-checked="true"
        aria-disabled="true"
        aria-label="Pay network gas in USDC (always on)"
        className="relative h-6 w-11 shrink-0 rounded-full"
        style={{ background: '#6366f1' }}
      >
        <span className="absolute left-0.5 top-0.5 size-5 translate-x-5 rounded-full bg-white" />
      </span>
    </div>
  )
}
