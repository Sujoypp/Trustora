import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { isAddress, zeroAddress, type Address } from 'viem'
import { Handshake, Plus, Trash2 } from 'lucide-react'
import { ContractGate } from '@/components/ContractGate'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { DealCard, type Act } from '@/components/DealCard'
import { EcosystemBadges } from '@/components/EcosystemBadges'
import { PageHeader } from '@/components/PageHeader'
import { useEscrowDeals } from '@/hooks/useTrustoraData'
import { useNow } from '@/hooks/useNow'
import { useOnchainTx } from '@/hooks/useOnchainTx'
import { useApp } from '@/lib/appContext'
import { AMOUNT_INPUT_RE, endOfDayUnix, parseUsdcInput } from '@/lib/amounts'
import { ESCROW_ADDRESS, ESCROW_ADDRESS_INVALID, ESCROW_ENV, escrowAbi } from '@/lib/contracts'
import { formatUsdc } from '@/lib/format'

type Mode = 'escrow' | 'milestones' | 'agreement'
interface Row {
  amount: string
  due: string
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'escrow', label: 'Smart Escrow', hint: 'One payment held until you release it, or refunded.' },
  { id: 'milestones', label: 'Milestones', hint: 'Split a payment into steps, released one approval at a time.' },
  { id: 'agreement', label: 'Trust Agreement', hint: 'Written terms the payee must accept before work starts, with optional arbiter.' },
]

const inputClass = 'glass-inner w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-[#64748B]'

export function EscrowPage() {
  const app = useApp()
  const now = useNow()
  const tx = useOnchainTx()
  const deals = useEscrowDeals(app.address)
  const [mode, setMode] = useState<Mode>('escrow')
  const [payee, setPayee] = useState('')
  const [arbiter, setArbiter] = useState('')
  const [rows, setRows] = useState<Row[]>([{ amount: '', due: '' }])
  const [terms, setTerms] = useState('')
  const [autoDays, setAutoDays] = useState('')
  const [acceptDays, setAcceptDays] = useState('7')

  const single = mode === 'escrow'
  const amounts = rows.map((r) => parseUsdcInput(r.amount))
  const total = amounts.every((a) => a !== null) ? amounts.reduce<bigint>((s, a) => s + (a ?? 0n), 0n) : null
  const problems: string[] = []
  if (!isAddress(payee)) problems.push('Enter the payee wallet address.')
  else if (app.address && payee.toLowerCase() === app.address.toLowerCase()) problems.push('The payee must be a different wallet.')
  if (arbiter && !isAddress(arbiter)) problems.push('The arbiter address is not valid.')
  if (arbiter && isAddress(arbiter) && payee && arbiter.toLowerCase() === payee.toLowerCase()) problems.push('The arbiter cannot be the payee.')
  if (total === null) problems.push('Enter an amount for every payment.')
  if (total !== null && app.balance && total > app.balance.raw) problems.push('Your USDC balance is lower than the total.')
  if (mode === 'agreement' && terms.trim().length < 10) problems.push('Write the agreement terms (at least 10 characters).')
  if (new TextEncoder().encode(terms).length > 1000) problems.push('The terms are too long (1000 bytes at most).')
  if (mode === 'agreement' && !(Number(acceptDays) >= 1)) problems.push('Give the payee at least 1 day to accept.')
  if (autoDays && !(Number(autoDays) >= 1 / 24 && Number(autoDays) <= 365)) problems.push('Auto-release must be between 1 hour and 365 days.')
  const ready = problems.length === 0 && Boolean(app.address) && !tx.busy

  const act: Act = (functionName, args, title, success) => {
    if (!ESCROW_ADDRESS) return
    void tx.run({ address: ESCROW_ADDRESS, abi: escrowAbi, functionName, args, title, success })
  }

  async function create() {
    if (!ESCROW_ADDRESS || total === null) return
    const dueAts = rows.map((r) => endOfDayUnix(r.due))
    const nowUnix = BigInt(now)
    const receipt = await tx.run({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: 'create',
      args: [
        payee,
        (arbiter && isAddress(arbiter) ? arbiter : zeroAddress),
        amounts.map((a) => a ?? 0n),
        dueAts,
        mode === 'agreement' ? nowUnix + BigInt(Math.round(Number(acceptDays) * 86_400)) : 0n,
        autoDays ? BigInt(Math.round(Number(autoDays) * 86_400)) : 0n,
        terms.trim(),
      ],
      approveAmount: total,
      title: 'Creating and funding the deal',
      success: 'Deal created and funded',
    })
    if (receipt) {
      setRows([{ amount: '', due: '' }])
      setTerms('')
    }
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader />
      <div className="mb-4">
        <EcosystemBadges show={['arc', 'usdc']} />
      </div>
      <ContractGate address={ESCROW_ADDRESS} invalid={ESCROW_ADDRESS_INVALID} env={ESCROW_ENV} kind="escrow" feature="Escrow">
        <div className="space-y-4">
          <section className="glass space-y-4 p-5 sm:p-6" aria-labelledby="escrow-create">
            <div>
              <h2 id="escrow-create" className="text-lg font-semibold">
                Create a deal
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                Your USDC moves into the escrow contract when you create the deal. It is released only by the rules below, and refunded if they say so.
              </p>
            </div>

            <div role="tablist" aria-label="Deal type" className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.id}
                  onClick={() => {
                    setMode(m.id)
                    if (m.id === 'escrow') setRows(rows.slice(0, 1))
                  }}
                  className="rounded-xl border p-3 text-left transition-colors duration-150"
                  style={{ borderColor: mode === m.id ? 'var(--border-hot)' : 'var(--border)', background: mode === m.id ? 'rgba(79,140,255,0.14)' : 'transparent' }}
                >
                  <span className="block text-sm font-semibold">{m.label}</span>
                  <span className="mt-0.5 block text-xs" style={{ color: 'var(--muted)' }}>
                    {m.hint}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow">Payee wallet</span>
                <input value={payee} onChange={(e) => setPayee(e.target.value.trim())} placeholder="0x..." className={`${inputClass} mono mt-1.5`} autoComplete="off" spellCheck={false} />
              </label>
              <label className="block">
                <span className="eyebrow">Arbiter wallet (optional)</span>
                <input value={arbiter} onChange={(e) => setArbiter(e.target.value.trim())} placeholder="0x... settles disputes" className={`${inputClass} mono mt-1.5`} autoComplete="off" spellCheck={false} />
              </label>
            </div>

            <div className="space-y-2">
              <p className="eyebrow">{single ? 'Amount' : 'Milestones'}</p>
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_11rem_auto]">
                  <input
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => AMOUNT_INPUT_RE.test(e.target.value) && setRow(i, { amount: e.target.value })}
                    placeholder={single ? 'USDC amount' : `Milestone ${i + 1} (USDC)`}
                    aria-label={`Amount ${i + 1} in USDC`}
                    className={`${inputClass} tabular-nums`}
                  />
                  <input type="date" value={row.due} onChange={(e) => setRow(i, { due: e.target.value })} aria-label={`Deadline ${i + 1} (optional)`} className={`${inputClass} col-span-2 sm:col-span-1 sm:order-none`} style={{ colorScheme: 'dark' }} />
                  {!single && rows.length > 1 ? (
                    <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} aria-label={`Remove milestone ${i + 1}`} className="ghost-btn flex size-10 items-center justify-center border" style={{ borderColor: 'var(--border)' }}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="hidden size-10 sm:block" />
                  )}
                </div>
              ))}
              {!single && rows.length < 20 && (
                <button type="button" onClick={() => setRows([...rows, { amount: '', due: '' }])} className="ghost-btn flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add milestone
                </button>
              )}
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                A deadline is optional. Once it passes, the payer can reclaim an undelivered milestone, and the payee can no longer mark it delivered.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow">Auto-release after delivery (days, optional)</span>
                <input inputMode="decimal" value={autoDays} onChange={(e) => /^\d{0,3}(\.\d{0,2})?$/.test(e.target.value) && setAutoDays(e.target.value)} placeholder="Off" className={`${inputClass} mt-1.5`} />
              </label>
              {mode === 'agreement' && (
                <label className="block">
                  <span className="eyebrow">Payee must accept within (days)</span>
                  <input inputMode="numeric" value={acceptDays} onChange={(e) => /^\d{0,3}$/.test(e.target.value) && setAcceptDays(e.target.value)} className={`${inputClass} mt-1.5`} />
                </label>
              )}
            </div>

            <label className="block">
              <span className="eyebrow">{mode === 'agreement' ? 'Agreement terms' : 'Description (optional)'}</span>
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={mode === 'agreement' ? 5 : 2} placeholder="What is being delivered, and what counts as done?" className={`${inputClass} mt-1.5 resize-y`} />
            </label>

            <p className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
              Total held in escrow: <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{total !== null ? formatUsdc(total) : '--'} USDC</span>. Each milestone is released only when the payer approves it, when auto-release applies, or when an arbiter rules. The terms text is stored in the public creation record.
            </p>
            {problems.length > 0 && (payee || rows[0].amount) && (
              <ul className="space-y-1 text-xs" style={{ color: 'var(--amber)' }} role="alert">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {app.isConnected ? (
              <button type="button" onClick={() => void create()} disabled={!ready} className="cta min-h-12 w-full text-base font-semibold">
                {tx.busy ? 'Working...' : 'Create and fund the deal'}
              </button>
            ) : (
              <ConnectKitButton.Custom>
                {({ show }) => (
                  <button type="button" onClick={show} className="cta min-h-12 w-full text-base font-semibold">
                    Connect Wallet
                  </button>
                )}
              </ConnectKitButton.Custom>
            )}
          </section>

          <section aria-labelledby="deals-title" className="space-y-3">
            <h2 id="deals-title" className="eyebrow">
              Your deals
            </h2>
            {!app.address ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to see deals you take part in.</p>
            ) : deals.isPending ? (
              <LoadingState label="Loading deals" />
            ) : deals.isError ? (
              <ErrorState title="Could not load deals" description="Check your connection and try again." onRetry={() => void deals.refetch()} />
            ) : deals.data.length === 0 ? (
              <EmptyState icon={Handshake} title="No deals yet" description="Create one above, or ask someone to name your wallet as the payee." />
            ) : (
              deals.data.map((deal) => <DealCard key={deal.id.toString()} deal={deal} me={app.address as Address} now={now} busy={tx.busy} act={act} />)
            )}
          </section>
        </div>
      </ContractGate>
      {tx.progress}
    </div>
  )
}
