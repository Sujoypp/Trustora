import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { isAddress, type Address } from 'viem'
import { ChevronDown, Plus, Split, Trash2 } from 'lucide-react'
import { ContractGate } from '@/components/ContractGate'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { EcosystemBadges } from '@/components/EcosystemBadges'
import { PageHeader } from '@/components/PageHeader'
import { TxLink } from '@/components/TxLink'
import { useSplitLegs, useSplits, type SplitRow } from '@/hooks/useTrustoraData'
import { useOnchainTx } from '@/hooks/useOnchainTx'
import { useApp } from '@/lib/appContext'
import { AMOUNT_INPUT_RE, parseUsdcInput } from '@/lib/amounts'
import { FLOWS_ADDRESS, FLOWS_ADDRESS_INVALID, FLOWS_ENV, flowsAbi } from '@/lib/contracts'
import { formatUsdc, fullDate, noteBytes, shortAddress } from '@/lib/format'

interface Row {
  to: string
  value: string
}
type Mode = 'amount' | 'percent'
const inputClass = 'glass-inner w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-[#64748B]'

function SplitHistory({ row }: { row: SplitRow }) {
  const [open, setOpen] = useState(false)
  const legs = useSplitLegs(row.id, row.split.createdBlock, open)
  return (
    <li className="glass-inner p-3 text-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="font-medium">Split #{row.id.toString()}</span>{' '}
          <span className="tabular-nums" style={{ color: 'var(--muted)' }}>
            · {formatUsdc(row.split.total)} USDC to {row.split.count} wallets · {fullDate(Number(row.split.createdAt))}
          </span>
        </span>
        <ChevronDown className={`size-4 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-3 space-y-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          {legs.isPending ? <p>Loading recipients...</p> : legs.data ? (
            <>
              {legs.data.legs.map((l, i) => (
                <p key={i} className="flex justify-between gap-3">
                  <span className="mono">{shortAddress(l.recipient)}</span>
                  <span className="tabular-nums" style={{ color: 'var(--ink)' }}>{formatUsdc(l.amount)} USDC</span>
                </p>
              ))}
              {legs.data.txHash && <p className="flex flex-wrap items-center gap-2 pt-1">Transaction <TxLink hash={legs.data.txHash} /></p>}
            </>
          ) : <p>The split record could not be loaded.</p>}
        </div>
      )}
    </li>
  )
}

export function SplitPage() {
  const app = useApp()
  const tx = useOnchainTx()
  const history = useSplits(app.address)
  const [mode, setMode] = useState<Mode>('amount')
  const [rows, setRows] = useState<Row[]>([{ to: '', value: '' }, { to: '', value: '' }])
  const [totalInput, setTotalInput] = useState('')
  const [note, setNote] = useState('')

  // Work out each recipient's amount in base units. In percent mode the last wallet gets the rounding remainder.
  let amounts: bigint[] | null = null
  const problems: string[] = []
  if (mode === 'amount') {
    const parsed = rows.map((r) => parseUsdcInput(r.value))
    if (parsed.every((p) => p !== null)) amounts = parsed
    else problems.push('Enter an amount for every wallet.')
  } else {
    const total = parseUsdcInput(totalInput)
    const bps = rows.map((r) => (/^\d{1,3}(\.\d{1,2})?$/.test(r.value) ? Math.round(Number(r.value) * 100) : -1))
    if (!total) problems.push('Enter the total to split.')
    else if (bps.some((b) => b <= 0)) problems.push('Enter a percentage for every wallet (up to 2 decimals).')
    else if (bps.reduce((s, b) => s + b, 0) !== 10_000) problems.push('The percentages must add up to exactly 100%.')
    else {
      const parts = bps.map((b) => (total * BigInt(b)) / 10_000n)
      parts[parts.length - 1] += total - parts.reduce((s, p) => s + p, 0n)
      amounts = parts
    }
  }
  const sum = amounts ? amounts.reduce((s, a) => s + a, 0n) : null
  const me = app.address?.toLowerCase()
  rows.forEach((r, i) => {
    if (r.to && !isAddress(r.to)) problems.push(`Wallet ${i + 1} is not a valid address.`)
    else if (r.to && r.to.toLowerCase() === me) problems.push('You cannot include your own wallet.')
  })
  if (rows.some((r) => !r.to)) problems.push('Enter every wallet address.')
  if (amounts && amounts.some((a) => a <= 0n)) problems.push('Every wallet must receive more than zero.')
  if (sum !== null && app.balance && sum > app.balance.raw) problems.push('Your USDC balance is lower than the total.')
  if (noteBytes(note) > 280) problems.push('The note is too long (280 bytes at most).')
  const ready = problems.length === 0 && amounts !== null && Boolean(app.address) && !tx.busy

  async function submit() {
    if (!FLOWS_ADDRESS || !amounts || sum === null) return
    const receipt = await tx.run({
      address: FLOWS_ADDRESS,
      abi: flowsAbi,
      functionName: 'split',
      args: [rows.map((r) => r.to as Address), amounts, note.trim()],
      approveAmount: sum,
      title: 'Sending split payment',
      success: `Split sent to ${rows.length} wallets`,
    })
    if (receipt) setRows(rows.map(() => ({ to: '', value: '' })))
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader />
      <div className="mb-4">
        <EcosystemBadges show={['arc', 'usdc']} />
      </div>
      <ContractGate address={FLOWS_ADDRESS} invalid={FLOWS_ADDRESS_INVALID} env={FLOWS_ENV} kind="flows" feature="Split payments">
        <div className="space-y-4">
          <section className="glass space-y-4 p-5 sm:p-6" aria-labelledby="split-title">
            <div>
              <h2 id="split-title" className="text-lg font-semibold">Split a payment</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                One transaction sends USDC from your wallet straight to every recipient. The contract never holds the money, and if any single transfer fails, nothing is sent.
              </p>
            </div>

            <div role="radiogroup" aria-label="Split by" className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border)' }}>
              {(['amount', 'percent'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150" style={{ background: mode === m ? 'rgba(79,140,255,0.25)' : 'transparent', color: mode === m ? '#e4eeff' : 'var(--muted)' }}>
                  {m === 'amount' ? 'Exact amounts' : 'Percentages'}
                </button>
              ))}
            </div>

            {mode === 'percent' && (
              <label className="block">
                <span className="eyebrow">Total to split (USDC)</span>
                <input inputMode="decimal" value={totalInput} onChange={(e) => AMOUNT_INPUT_RE.test(e.target.value) && setTotalInput(e.target.value)} placeholder="0.00" className={`${inputClass} mt-1.5 tabular-nums`} />
              </label>
            )}

            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_7.5rem_auto] items-center gap-2">
                  <input value={row.to} onChange={(e) => setRow(i, { to: e.target.value.trim() })} placeholder={`Wallet ${i + 1}: 0x...`} aria-label={`Wallet ${i + 1} address`} className={`${inputClass} mono min-w-0`} autoComplete="off" spellCheck={false} />
                  <input inputMode="decimal" value={row.value} onChange={(e) => (mode === 'amount' ? AMOUNT_INPUT_RE : /^\d{0,3}(\.\d{0,2})?$/).test(e.target.value) && setRow(i, { value: e.target.value })} placeholder={mode === 'amount' ? 'USDC' : '%'} aria-label={mode === 'amount' ? `Amount ${i + 1} in USDC` : `Percentage ${i + 1}`} className={`${inputClass} tabular-nums`} />
                  <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} disabled={rows.length <= 1} aria-label={`Remove wallet ${i + 1}`} className="ghost-btn flex size-10 items-center justify-center border disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {rows.length < 50 && (
                <button type="button" onClick={() => setRows([...rows, { to: '', value: '' }])} className="ghost-btn flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add wallet
                </button>
              )}
            </div>

            <label className="block">
              <span className="eyebrow">Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is this split for?" className={`${inputClass} mt-1.5`} />
            </label>

            {amounts && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Total sent: <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{formatUsdc(sum ?? 0n)} USDC</span> to {rows.length} wallet{rows.length === 1 ? '' : 's'}.
              </p>
            )}
            {problems.length > 0 && rows.some((r) => r.to || r.value) && (
              <ul className="space-y-1 text-xs" style={{ color: 'var(--amber)' }} role="alert">
                {[...new Set(problems)].map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
            {app.isConnected ? (
              <button type="button" onClick={() => void submit()} disabled={!ready} className="cta min-h-12 w-full text-base font-semibold">
                {tx.busy ? 'Working...' : 'Send split payment'}
              </button>
            ) : (
              <ConnectKitButton.Custom>
                {({ show }) => <button type="button" onClick={show} className="cta min-h-12 w-full text-base font-semibold">Connect Wallet</button>}
              </ConnectKitButton.Custom>
            )}
          </section>

          <section aria-labelledby="split-history" className="space-y-3">
            <h2 id="split-history" className="eyebrow">Your splits</h2>
            {!app.address ? <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to see your splits.</p>
              : history.isPending ? <LoadingState label="Loading splits" rows={2} />
              : history.isError ? <ErrorState title="Could not load your splits" onRetry={() => void history.refetch()} />
              : history.data.length === 0 ? <EmptyState icon={Split} title="No splits yet" description="Your split payments will be listed here with their recipients." />
              : <ul className="space-y-2">{history.data.map((r) => <SplitHistory key={r.id.toString()} row={r} />)}</ul>}
          </section>
        </div>
      </ContractGate>
      {tx.progress}
    </div>
  )
}
