import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useReadContract } from 'wagmi'
import { erc20Abi, isAddress, type Address } from 'viem'
import { ContractGate } from '@/components/ContractGate'
import { EcosystemBadges } from '@/components/EcosystemBadges'
import { PageHeader } from '@/components/PageHeader'
import { useSchedules, type ScheduleRow } from '@/hooks/useTrustoraData'
import { useNow } from '@/hooks/useNow'
import { useOnchainTx } from '@/hooks/useOnchainTx'
import { useApp } from '@/lib/appContext'
import { AMOUNT_INPUT_RE, dateTimeUnix, parseUsdcInput } from '@/lib/amounts'
import { FLOWS_ADDRESS, FLOWS_ENV, flowsAbi } from '@/lib/contracts'
import { formatUsdc, fullDate, noteBytes, shortAddress } from '@/lib/format'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/trustora'

const INTERVALS = [
  { id: 'hour', label: 'Every hour', seconds: 3_600 },
  { id: 'day', label: 'Every day', seconds: 86_400 },
  { id: 'week', label: 'Every week', seconds: 7 * 86_400 },
  { id: 'two-weeks', label: 'Every 2 weeks', seconds: 14 * 86_400 },
  { id: 'month', label: 'Every 30 days', seconds: 30 * 86_400 },
] as const

const inputClass = 'glass-inner w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-[#64748B]'
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const intervalText = (seconds: bigint) => INTERVALS.find((i) => BigInt(i.seconds) === seconds)?.label.toLowerCase() ?? `every ${Number(seconds) / 3600} hours`

function ScheduleCard({ row, me, now, busy, onExecute, onCancel }: { row: ScheduleRow; me: Address; now: number; busy: boolean; onExecute: () => void; onCancel: () => void }) {
  const s = row.schedule
  const isPayer = same(s.payer, me)
  const due = s.active && BigInt(now) >= s.nextAt
  return (
    <article className="glass space-y-3 p-5" aria-label={`Schedule ${row.id.toString()}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">
            {formatUsdc(s.amount)} USDC <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>{intervalText(s.interval)}</span>
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            {isPayer ? <>To <span className="mono">{shortAddress(s.payee)}</span></> : <>From <span className="mono">{shortAddress(s.payer)}</span> (you receive)</>} · schedule #{row.id.toString()}
          </p>
        </div>
        <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ color: s.active ? 'var(--emerald)' : 'var(--muted)', background: 'rgba(255,255,255,0.05)' }}>
          {s.active ? (due ? 'Due now' : 'Active') : s.remaining === 0 ? 'Completed' : 'Cancelled'}
        </span>
      </div>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {s.executed} paid · {s.remaining} remaining{s.active && ` · next payment ${fullDate(Number(s.nextAt))}`}
        {s.note && ` · ${s.note}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {due && (
          <button type="button" onClick={onExecute} disabled={busy} className="cta min-h-10 px-5 text-sm font-semibold">
            Run this payment now
          </button>
        )}
        {isPayer && s.active && (
          <button type="button" onClick={onCancel} disabled={busy} className="ghost-btn min-h-10 border px-4 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
            Cancel schedule
          </button>
        )}
      </div>
    </article>
  )
}

export function RecurringPage() {
  const app = useApp()
  const now = useNow()
  const tx = useOnchainTx()
  const list = useSchedules(app.address)
  const allowance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: app.address && FLOWS_ADDRESS ? [app.address, FLOWS_ADDRESS] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(app.address && FLOWS_ADDRESS), refetchInterval: 20_000 },
  })

  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [interval, setInterval] = useState<string>('week')
  const [count, setCount] = useState('4')
  const [startNow, setStartNow] = useState(true)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState('')

  const raw = parseUsdcInput(amount)
  const payments = /^\d{1,4}$/.test(count) ? Number(count) : 0
  const authorize = raw && payments >= 1 && payments <= 1000 ? raw * BigInt(payments) : null
  const firstAt = startNow ? 0n : dateTimeUnix(date, time)
  const problems: string[] = []
  if (!isAddress(payee)) problems.push('Enter the payee wallet address.')
  else if (app.address && payee.toLowerCase() === app.address.toLowerCase()) problems.push('The payee must be a different wallet.')
  if (!raw) problems.push('Enter the amount of each payment.')
  if (payments < 1 || payments > 1000) problems.push('Use between 1 and 1000 payments.')
  if (!startNow && (firstAt === 0n || firstAt < BigInt(now))) problems.push('Pick a start time in the future, or start now.')
  if (noteBytes(note) > 280) problems.push('The note is too long (280 bytes at most).')
  const ready = problems.length === 0 && Boolean(app.address) && !tx.busy

  async function create() {
    if (!FLOWS_ADDRESS || !raw || !authorize) return
    const seconds = INTERVALS.find((i) => i.id === interval)?.seconds ?? 604_800
    const receipt = await tx.run({
      address: FLOWS_ADDRESS,
      abi: flowsAbi,
      functionName: 'createSchedule',
      args: [payee, raw, BigInt(seconds), firstAt, payments, note.trim()],
      approveAmount: authorize,
      title: 'Authorizing recurring payments',
      success: 'Recurring payment scheduled',
    })
    if (receipt) {
      setAmount('')
      setNote('')
    }
  }

  const rows = list.data ?? []
  const needed = rows.reduce((sum, r) => (app.address && same(r.schedule.payer, app.address) && r.schedule.active ? sum + r.schedule.amount * BigInt(r.schedule.remaining) : sum), 0n)
  const short = allowance.data !== undefined && needed > allowance.data

  const execute = (id: bigint) => FLOWS_ADDRESS && void tx.run({ address: FLOWS_ADDRESS, abi: flowsAbi, functionName: 'executeSchedule', args: [id], title: 'Running scheduled payment', success: 'Scheduled payment sent' })
  const cancel = (id: bigint) => FLOWS_ADDRESS && void tx.run({ address: FLOWS_ADDRESS, abi: flowsAbi, functionName: 'cancelSchedule', args: [id], title: 'Cancelling schedule', success: 'Schedule cancelled' })
  const topUp = () => FLOWS_ADDRESS && void tx.run({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [FLOWS_ADDRESS, needed], title: 'Authorizing USDC', success: 'USDC authorization updated' })

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader />
      <div className="mb-4">
        <EcosystemBadges show={['arc', 'usdc']} />
      </div>
      <ContractGate address={FLOWS_ADDRESS} env={FLOWS_ENV} kind="flows" feature="Recurring payments">
        <div className="space-y-4">
          <section className="glass space-y-4 p-5 sm:p-6" aria-labelledby="rec-title">
            <div>
              <h2 id="rec-title" className="text-lg font-semibold">Schedule recurring payments</h2>
              <p className="mt-1 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
                You authorize the total up front with a USDC allowance. Blockchains cannot run on their own, so each payment is sent when anyone (you, the payee, or an automated service) presses Run once it is due. The contract can only pay this payee this amount, never more, and you can cancel any time.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow">Payee wallet</span>
                <input value={payee} onChange={(e) => setPayee(e.target.value.trim())} placeholder="0x..." className={`${inputClass} mono mt-1.5`} autoComplete="off" spellCheck={false} />
              </label>
              <label className="block">
                <span className="eyebrow">Amount per payment (USDC)</span>
                <input inputMode="decimal" value={amount} onChange={(e) => AMOUNT_INPUT_RE.test(e.target.value) && setAmount(e.target.value)} placeholder="0.00" className={`${inputClass} mt-1.5 tabular-nums`} />
              </label>
              <label className="block">
                <span className="eyebrow">How often</span>
                <select value={interval} onChange={(e) => setInterval(e.target.value)} className={`${inputClass} mt-1.5`}>
                  {INTERVALS.map((i) => <option key={i.id} value={i.id} className="bg-[#0C101B]">{i.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="eyebrow">Number of payments</span>
                <input inputMode="numeric" value={count} onChange={(e) => /^\d{0,4}$/.test(e.target.value) && setCount(e.target.value)} className={`${inputClass} mt-1.5`} />
              </label>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} className="size-4 accent-indigo-500" />
                First payment is due immediately
              </label>
              {!startNow && (
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="First payment date" className={inputClass} style={{ colorScheme: 'dark' }} />
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="First payment time" className={inputClass} style={{ colorScheme: 'dark' }} />
                </div>
              )}
            </div>
            <label className="block">
              <span className="eyebrow">Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: rent, subscription, salary" className={`${inputClass} mt-1.5`} />
            </label>
            {authorize !== null && (
              <p className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
                You will authorize up to <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{formatUsdc(authorize)} USDC</span> ({payments} × {formatUsdc(raw ?? 0n)}). Your wallet will ask you to approve that exact amount first, then to create the schedule. Nothing is paid until a payment is run.
              </p>
            )}
            {problems.length > 0 && (payee || amount) && (
              <ul className="space-y-1 text-xs" style={{ color: 'var(--amber)' }} role="alert">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
            {app.isConnected ? (
              <button type="button" onClick={() => void create()} disabled={!ready} className="cta min-h-12 w-full text-base font-semibold">
                {tx.busy ? 'Working...' : 'Authorize and schedule'}
              </button>
            ) : (
              <ConnectKitButton.Custom>
                {({ show }) => <button type="button" onClick={show} className="cta min-h-12 w-full text-base font-semibold">Connect Wallet</button>}
              </ConnectKitButton.Custom>
            )}
          </section>

          {short && (
            <div className="rounded-xl border p-3 text-sm" style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.07)' }} role="alert">
              <p className="font-semibold" style={{ color: 'var(--amber)' }}>Your USDC authorization is lower than your remaining payments</p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Allowance {formatUsdc(allowance.data ?? 0n)} USDC, needed {formatUsdc(needed)} USDC. Payments will fail until you top it up.</p>
              <button type="button" onClick={topUp} disabled={tx.busy} className="cta mt-2 min-h-9 px-4 text-xs font-semibold">Authorize {formatUsdc(needed)} USDC</button>
            </div>
          )}

          <section aria-labelledby="rec-list" className="space-y-3">
            <h2 id="rec-list" className="eyebrow">Your schedules</h2>
            {!app.address ? <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to see your schedules.</p>
              : list.isPending ? <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading schedules...</p>
              : list.isError ? <p className="text-sm" style={{ color: 'var(--amber)' }} role="alert">Could not load schedules. Check your connection.</p>
              : rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--muted)' }}>No schedules yet.</p>
              : rows.map((r) => <ScheduleCard key={r.id.toString()} row={r} me={app.address as Address} now={now} busy={tx.busy} onExecute={() => execute(r.id)} onCancel={() => cancel(r.id)} />)}
          </section>
        </div>
      </ContractGate>
      {tx.progress}
    </div>
  )
}
