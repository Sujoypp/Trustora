import { Check, Loader2, X } from 'lucide-react'

export type BridgeStage = 'idle' | 'initiate' | 'attestation' | 'complete' | 'done'

const STEPS = [
  { key: 'initiate', title: 'Initiate', body: (from: string) => `Approve and burn USDC on ${from}.` },
  { key: 'attestation', title: 'Attestation', body: () => 'Circle signs a proof that the USDC was burned.' },
  { key: 'complete', title: 'Complete', body: (_from: string, to: string) => `Native USDC is minted on ${to}.` },
] as const

const order: Record<BridgeStage, number> = { idle: -1, initiate: 0, attestation: 1, complete: 2, done: 3 }

/** The three stages of a CCTP transfer. `failedAt` marks the step where a stopped transfer failed. */
export function BridgeSteps({ stage, failedAt, from, to }: { stage: BridgeStage; failedAt: 0 | 1 | 2 | null; from: string; to: string }) {
  const idx = order[stage]
  return (
    <ol className="grid gap-2 sm:grid-cols-3" aria-label="CCTP transfer progress">
      {STEPS.map((s, i) => {
        const failed = failedAt === i
        const done = !failed && idx > i
        const active = !failed && idx === i
        return (
          <li
            key={s.key}
            className="flex items-start gap-3 rounded-xl border p-3"
            style={{ borderColor: failed ? 'rgba(244,63,94,0.45)' : active ? 'rgba(34,211,238,0.5)' : done ? 'rgba(52,211,153,0.35)' : 'var(--border)', background: active ? 'rgba(34,211,238,0.05)' : 'transparent' }}
            aria-current={active ? 'step' : undefined}
          >
            <span
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
              style={{ borderColor: failed ? 'var(--danger)' : done ? 'var(--emerald)' : active ? '#22d3ee' : 'var(--border)', color: failed ? 'var(--danger)' : done ? 'var(--emerald)' : active ? '#22d3ee' : 'var(--muted)' }}
            >
              {failed ? <X className="size-3.5" aria-hidden="true" /> : done ? <Check className="size-3.5" aria-hidden="true" /> : active ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{s.title}</span>
              <span className="block text-xs text-pretty" style={{ color: 'var(--muted)' }}>
                {s.body(from, to)}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
