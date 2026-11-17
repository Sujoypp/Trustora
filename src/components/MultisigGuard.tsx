import { ShieldCheck } from 'lucide-react'
import { cosignerValid, type Guard } from '@/lib/guard'

interface Props {
  guard: Guard
  onChange: (patch: Partial<Guard>) => void
  disabled?: boolean
  /** True when the current amount is at or above the threshold. */
  triggered: boolean
}

/** Optional 2-of-2 security guard for high-value transfers. Preview: it asks for an extra confirmation but cannot enforce a co-signer. */
export function MultisigGuard({ guard, onChange, disabled, triggered }: Props) {
  const cosignerBad = guard.cosigner.trim() !== '' && !cosignerValid(guard.cosigner)

  return (
    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: guard.enabled ? 'rgba(244,114,182,0.45)' : 'var(--border)', background: 'rgba(244,114,182,0.04)' }}>
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-5 shrink-0" style={{ color: '#f472b6' }} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Multisig 2-of-2 Security Guard
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: 'rgba(245,158,11,0.14)', color: 'var(--amber)' }}>
              Preview
            </span>
          </p>
          <p className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
            Extra protection for high-value transfers.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={guard.enabled}
          aria-label="Multisig 2-of-2 Security Guard"
          disabled={disabled}
          onClick={() => onChange({ enabled: !guard.enabled })}
          className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
          style={{ background: guard.enabled ? '#6366f1' : 'rgba(255,255,255,0.12)' }}
        >
          <span className="absolute left-0.5 top-0.5 size-6 rounded-full bg-white transition-transform" style={{ transform: guard.enabled ? 'translateX(20px)' : 'none' }} />
        </button>
      </div>

      {guard.enabled && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
            <label className="glass-inner flex items-center gap-1 rounded-xl px-3">
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                From
              </span>
              <input
                inputMode="numeric"
                value={guard.threshold}
                onChange={(e) => onChange({ threshold: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })}
                disabled={disabled}
                aria-label="Threshold in USDC"
                className="min-h-10 w-full bg-transparent text-right text-sm font-semibold tabular-nums outline-none"
              />
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                USDC
              </span>
            </label>
            <input
              value={guard.cosigner}
              onChange={(e) => onChange({ cosigner: e.target.value })}
              disabled={disabled}
              placeholder="Co-signer address (0x...)"
              aria-label="Co-signer address"
              spellCheck={false}
              className="glass-inner mono min-h-10 rounded-xl bg-transparent px-3 text-xs outline-none placeholder:text-slate-600"
            />
          </div>
          {cosignerBad && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              Enter a valid co-signer address.
            </p>
          )}
          <p className="text-xs text-pretty" style={{ color: triggered ? 'var(--amber)' : 'var(--subtle)' }}>
            {triggered
              ? 'This payment is above your threshold. Co-signer approval is not enforced yet, so Trustora asks you to confirm instead.'
              : `Payments of ${guard.threshold.toLocaleString()} USDC or more would need your co-signer. Preview only: nothing is blocked.`}
          </p>
        </div>
      )}
    </div>
  )
}
