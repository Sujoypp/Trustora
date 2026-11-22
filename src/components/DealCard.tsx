import { useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import type { Address } from 'viem'
import { TxLink } from '@/components/TxLink'
import { useAgreementCreation, type Deal } from '@/hooks/useTrustoraData'
import { DISPUTE_TIMEOUT_SECONDS, ESCROW_ADDRESS, MilestoneState, RECOVERY_DELAY_SECONDS } from '@/lib/contracts'
import { formatUsdc, fullDate, shortAddress, shortHash } from '@/lib/format'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { CHAIN_ID } from '@/lib/trustora'

export type Act = (functionName: string, args: readonly unknown[], title: string, success: string) => void

interface Props {
  deal: Deal
  me: Address
  now: number
  busy: boolean
  act: Act
}

const STATE_LABEL: Record<number, { text: string; color: string }> = {
  [MilestoneState.Funded]: { text: 'Funded', color: '#a9c6ff' },
  [MilestoneState.Delivered]: { text: 'Delivered', color: 'var(--cyan)' },
  [MilestoneState.Disputed]: { text: 'In dispute', color: 'var(--amber)' },
  [MilestoneState.Released]: { text: 'Paid to payee', color: 'var(--emerald)' },
  [MilestoneState.Refunded]: { text: 'Refunded to payer', color: 'var(--muted)' },
  [MilestoneState.Unclaimed]: { text: 'Payout waiting to be claimed', color: 'var(--amber)' },
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const NO_ARBITER = '0x0000000000000000000000000000000000000000'

function Btn({ children, onClick, disabled, primary }: { children: React.ReactNode; onClick: () => void; disabled: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${primary ? 'cta' : 'ghost-btn border'} min-h-9 px-3.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50`}
      style={primary ? undefined : { borderColor: 'var(--border)' }}
    >
      {children}
    </button>
  )
}

function Party({ label, address, me }: { label: string; address: string; me: Address }) {
  return (
    <span className="min-w-0">
      <span style={{ color: 'var(--subtle)' }}>{label} </span>
      <a href={buildAddressExplorerUrl(CHAIN_ID, address)} target="_blank" rel="noopener noreferrer" className="mono underline decoration-white/20 underline-offset-2">
        {shortAddress(address)}
      </a>
      {same(address, me) && (
        <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(79,140,255,0.2)', color: '#cfe0ff' }}>
          You
        </span>
      )}
    </span>
  )
}

/** One escrow deal: parties, status, milestones and only the actions this wallet may take right now. */
export function DealCard({ deal, me, now, busy, act }: Props) {
  const { id, agreement: a, milestones } = deal
  const [open, setOpen] = useState(false)
  const creation = useAgreementCreation(id, a.createdBlock, open)
  const isPayer = same(a.payer, me)
  const isPayee = same(a.payee, me)
  const isArbiter = a.arbiter !== NO_ARBITER && same(a.arbiter, me)
  const hasArbiter = a.arbiter !== NO_ARBITER
  const live = a.accepted && !a.cancelled
  const settled = milestones.every((m) => m.state === MilestoneState.Released || m.state === MilestoneState.Refunded)
  const acceptOpen = !a.accepted && !a.cancelled && (a.acceptBy === 0n || BigInt(now) <= a.acceptBy)
  const status = a.cancelled ? 'Cancelled' : !a.accepted ? 'Waiting for the payee to accept' : settled ? 'Settled' : 'Active'
  const n = Number(id)

  return (
    <article className="glass space-y-4 p-5" aria-label={`Deal ${n}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">
            Deal #{n} <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>· {formatUsdc(a.total)} USDC · {a.milestoneCount} {a.milestoneCount === 1 ? 'payment' : 'milestones'}</span>
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            {status} · created {fullDate(Number(a.createdAt))}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="ghost-btn flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
          Details
          <ChevronDown className={`size-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        <Party label="Payer" address={a.payer} me={me} />
        <Party label="Payee" address={a.payee} me={me} />
        {hasArbiter && <Party label="Arbiter" address={a.arbiter} me={me} />}
      </div>

      {open && (
        <div className="glass-inner space-y-2 p-3 text-xs" style={{ color: 'var(--muted)' }}>
          <p>
            Terms hash: <span className="mono" style={{ color: 'var(--ink)' }}>{shortHash(a.termsHash)}</span>
          </p>
          {creation.isPending ? <p>Loading terms...</p> : creation.data ? (
            <>
              <p className="whitespace-pre-wrap break-words" style={{ color: 'var(--ink)' }}>{creation.data.terms || 'No written terms were attached.'}</p>
              <p className="flex flex-wrap items-center gap-2">Created in <TxLink hash={creation.data.txHash} /></p>
            </>
          ) : <p>The creation record could not be loaded.</p>}
          {a.acceptBy !== 0n && <p>Accept by: {fullDate(Number(a.acceptBy))}</p>}
          {a.autoReleaseAfter !== 0n && <p>Auto-release after delivery: {Number(a.autoReleaseAfter) / 86_400} days without a dispute</p>}
          {ESCROW_ADDRESS && (
            <a href={buildAddressExplorerUrl(CHAIN_ID, ESCROW_ADDRESS)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: '#a9c6ff' }}>
              Escrow contract <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {(acceptOpen || (!a.accepted && !a.cancelled)) && (
        <div className="flex flex-wrap gap-2">
          {isPayee && acceptOpen && <Btn primary disabled={busy} onClick={() => act('accept', [id], 'Accepting agreement', 'Agreement accepted')}>Accept agreement</Btn>}
          {(isPayee || isPayer) && <Btn disabled={busy} onClick={() => act('decline', [id], isPayer ? 'Cancelling agreement' : 'Declining agreement', 'Agreement closed and funds returned')}>{isPayer ? 'Cancel and refund' : 'Decline'}</Btn>}
        </div>
      )}

      <ol className="space-y-3">
        {milestones.map((m, index) => {
          const i = BigInt(index)
          const label = STATE_LABEL[m.state] ?? { text: 'Unknown', color: 'var(--muted)' }
          const overdue = m.dueAt !== 0n && BigInt(now) > m.dueAt
          const autoReady = m.state === MilestoneState.Delivered && a.autoReleaseAfter !== 0n && BigInt(now) >= m.deliveredAt + a.autoReleaseAfter
          const disputeExpired = m.state === MilestoneState.Disputed && BigInt(now) >= m.stateAt + BigInt(DISPUTE_TIMEOUT_SECONDS)
          const recoverReady = m.state === MilestoneState.Unclaimed && isPayer && BigInt(now) >= m.stateAt + BigInt(RECOVERY_DELAY_SECONDS)
          const buttons: React.ReactNode[] = []
          const add = (key: string, text: string, fn: string, args: readonly unknown[], title: string, ok: string, primary = false) =>
            buttons.push(<Btn key={key} primary={primary} disabled={busy} onClick={() => act(fn, args, title, ok)}>{text}</Btn>)

          if (live || m.state === MilestoneState.Unclaimed) {
            if (m.state === MilestoneState.Funded && live) {
              if (isPayee && !overdue) add('deliver', 'Mark as delivered', 'markDelivered', [id, i], 'Marking delivered', 'Marked as delivered', true)
              if (isPayee) add('waive', 'Refund payer', 'refund', [id, i], 'Refunding payer', 'Milestone refunded to the payer')
              if (isPayer) add('approve', 'Approve and release', 'approve', [id, i], 'Releasing payment', 'Payment released to the payee', true)
              if (isPayer && overdue) add('late', 'Reclaim (deadline passed)', 'refund', [id, i], 'Reclaiming funds', 'Funds returned to you')
            }
            if (m.state === MilestoneState.Delivered && live) {
              if (isPayer) add('approve', 'Approve and release', 'approve', [id, i], 'Releasing payment', 'Payment released to the payee', true)
              if ((isPayer || isPayee) && hasArbiter) add('dispute', 'Open a dispute', 'dispute', [id, i], 'Opening dispute', 'Dispute opened')
              if (isPayee) add('waive', 'Refund payer', 'refund', [id, i], 'Refunding payer', 'Milestone refunded to the payer')
              if (autoReady) add('auto', 'Release to payee (auto-release)', 'autoRelease', [id, i], 'Releasing payment', 'Payment released to the payee')
            }
            if (m.state === MilestoneState.Disputed && live) {
              if (isArbiter) {
                add('toPayee', 'Resolve: pay the payee', 'resolve', [id, i, true], 'Resolving dispute', 'Dispute resolved for the payee', true)
                add('toPayer', 'Resolve: refund the payer', 'resolve', [id, i, false], 'Resolving dispute', 'Dispute resolved for the payer')
              }
              if (isPayer) add('approve', 'Approve and release', 'approve', [id, i], 'Releasing payment', 'Payment released to the payee')
              if (isPayee) add('waive', 'Refund payer', 'refund', [id, i], 'Refunding payer', 'Milestone refunded to the payer')
              if ((isPayer || isPayee) && disputeExpired) add('expire', 'Split 50/50 (arbiter silent for 30 days)', 'settleExpiredDispute', [id, i], 'Settling dispute', 'Dispute settled 50/50')
            }
            if (m.state === MilestoneState.Unclaimed) {
              if (isPayer || isPayee) add('claim', 'Claim payout', 'claim', [id, i], 'Claiming payout', 'Payout claimed', true)
              if (recoverReady) add('recover', 'Recover unclaimed funds', 'recoverUnclaimed', [id, i], 'Recovering funds', 'Unclaimed funds recovered')
            }
          }

          return (
            <li key={index} className="glass-inner space-y-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  {a.milestoneCount > 1 ? `Milestone ${index + 1}` : 'Payment'} · <span className="tabular-nums">{formatUsdc(m.amount)} USDC</span>
                </span>
                <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ color: label.color, background: 'rgba(255,255,255,0.05)' }}>{label.text}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {m.dueAt !== 0n ? `Deadline ${fullDate(Number(m.dueAt))}${overdue && m.state === MilestoneState.Funded ? ' (passed)' : ''}` : 'No deadline'}
                {m.deliveredAt !== 0n && ` · delivered ${fullDate(Number(m.deliveredAt))}`}
              </p>
              {buttons.length > 0 && <div className="flex flex-wrap gap-2">{buttons}</div>}
            </li>
          )
        })}
      </ol>
    </article>
  )
}
