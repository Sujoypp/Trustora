import { createPortal } from 'react-dom'
import type { Hex } from 'viem'
import { Check } from 'lucide-react'
import { TxLink } from '@/components/TxLink'
import type { SendPhase } from '@/hooks/useSendPayment'
import { NETWORK_NAME } from '@/lib/trustora'

interface Props {
  phase: SendPhase
  /** Set once the wallet has signed and the transaction is on its way. */
  txHash: Hex | null
  title: string
}

const WALLET_COPY: Partial<Record<SendPhase, string>> = {
  switching: `Approve the switch to ${NETWORK_NAME} in your wallet.`,
  'signing-approval': 'Confirm the one-time USDC allowance in your wallet.',
  'confirming-approval': `Confirming your allowance on ${NETWORK_NAME}.`,
  signing: 'Review the details and sign in your wallet.',
}

type StepState = 'done' | 'active' | 'todo'

/** Live three-step progress for a transaction: Signing, Broadcasting, Confirmed. */
export function TxProgress({ phase, txHash, title }: Props) {
  if (phase === 'idle') return null
  const current = phase === 'confirming' ? 1 : 0
  const state = (i: number): StepState => (i < current ? 'done' : i === current ? 'active' : 'todo')

  const steps: { label: string; detail: React.ReactNode }[] = [
    { label: 'Signing', detail: current > 0 ? 'Signed in your wallet.' : WALLET_COPY[phase] },
    {
      label: 'Broadcasting',
      detail:
        current === 1 ? (
          <>
            Sent to {NETWORK_NAME}. Waiting for it to confirm.
            {txHash && (
              <span className="mt-1 block">
                <TxLink hash={txHash} />
              </span>
            )}
          </>
        ) : (
          'Starts as soon as you sign.'
        ),
    },
    { label: `Confirmed on ${NETWORK_NAME}`, detail: 'Your receipt opens here the moment it confirms.' },
  ]

  return createPortal(
    <div className="anim-enter fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,7,12,0.8)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="txp-title" className="glass pop-in w-full max-w-sm p-6">
        <h2 id="txp-title" className="text-base font-semibold">
          {title}
        </h2>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
          Keep this window open until it confirms.
        </p>

        <ol className="mt-5 space-y-4" aria-live="polite">
          {steps.map((step, i) => {
            const s = state(i)
            return (
              <li key={step.label} className="flex items-start gap-3">
                <span
                  className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: s === 'todo' ? 'var(--border)' : s === 'done' ? 'rgba(16,185,129,0.5)' : 'rgba(99,102,241,0.6)',
                    background: s === 'done' ? 'rgba(16,185,129,0.14)' : 'transparent',
                    color: 'var(--emerald)',
                  }}
                >
                  {s === 'done' && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
                  {s === 'active' && <span className="orbit-spinner size-3.5 rounded-full border-2" style={{ borderColor: '#a5b4fc', borderTopColor: 'transparent' }} />}
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-medium" style={{ color: s === 'todo' ? 'var(--subtle)' : 'var(--ink)' }}>
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                    {step.detail}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>,
    document.body,
  )
}
