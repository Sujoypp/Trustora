import { Sparkles } from 'lucide-react'
import { useLocalStore } from '@/lib/localStore'
import { formatUsdc } from '@/lib/format'

const parseFlag = (raw: string) => raw === 'true'

interface Props {
  /** Current network fee estimate in USDC (6-decimal view), when known. */
  feeUsdc?: bigint
  disabled?: boolean
}

/** A what-if view of sponsored (gasless) micro-transfers. It never changes the transaction. */
export function SponsorPreview({ feeUsdc, disabled }: Props) {
  const [on, setOn] = useLocalStore('trustora:sponsor-preview', parseFlag, false)

  return (
    <div className="glass-inner p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4" style={{ color: '#a5b4fc' }} aria-hidden="true" />
            Sponsored fees
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: 'rgba(245,158,11,0.14)', color: 'var(--amber)' }}>
              Simulation
            </span>
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            Preview how a gasless micro-transfer would look.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Sponsored fees simulation"
          disabled={disabled}
          onClick={() => setOn(!on)}
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50"
          style={{ background: on ? '#6366f1' : 'rgba(255,255,255,0.12)' }}
        >
          <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform duration-150" style={{ transform: on ? 'translateX(20px)' : 'none' }} />
        </button>
      </div>

      {on && (
        <div className="mt-3 space-y-2 border-t pt-3 text-xs" style={{ borderColor: 'var(--border)' }}>
          <p className="flex justify-between gap-3">
            <span style={{ color: 'var(--muted)' }}>Fee you would pay</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--emerald)' }}>
              0.0000 USDC
            </span>
          </p>
          <p className="flex justify-between gap-3">
            <span style={{ color: 'var(--muted)' }}>A sponsor would cover</span>
            <span className="font-semibold tabular-nums">{feeUsdc !== undefined ? `~${formatUsdc(feeUsdc, 4)} USDC` : 'Estimating...'}</span>
          </p>
          <p className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--amber)' }} role="note">
            Simulation only. This payment is not sponsored: your wallet still pays the network fee shown below. Real sponsorship needs a paymaster (such as Circle Gas Station) and a smart-account wallet.
          </p>
        </div>
      )}
    </div>
  )
}
