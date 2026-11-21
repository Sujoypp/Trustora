import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { isAddress, zeroAddress, type Address } from 'viem'
import { Check, Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { ContractGate } from '@/components/ContractGate'
import { EcosystemBadges } from '@/components/EcosystemBadges'
import { PageHeader } from '@/components/PageHeader'
import { useInvoice, useInvoices, type InvoiceRow } from '@/hooks/useTrustoraData'
import { useNow } from '@/hooks/useNow'
import { useOnchainTx } from '@/hooks/useOnchainTx'
import { useShareBase } from '@/hooks/useShareBase'
import { useApp } from '@/lib/appContext'
import { AMOUNT_INPUT_RE, endOfDayUnix, parseUsdcInput } from '@/lib/amounts'
import { FLOWS_ADDRESS, FLOWS_ENV, InvoiceStatus, flowsAbi } from '@/lib/contracts'
import { formatUsdc, fullDate, noteBytes, shortAddress } from '@/lib/format'
import { useRoute } from '@/lib/router'

const inputClass = 'glass-inner w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-[#64748B]'
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

type Invoice = InvoiceRow['invoice']

function InvoiceCard({ id, invoice, me, now, busy, base, onPay, onCancel, highlight }: { id: bigint; invoice: Invoice; me?: Address; now: number; busy: boolean; base: string | null; onPay: () => void; onCancel: () => void; highlight?: boolean }) {
  const [copied, setCopied] = useState(false)
  const isIssuer = me ? same(invoice.issuer, me) : false
  const open = invoice.status === InvoiceStatus.Open
  const anyone = invoice.payer === zeroAddress
  const canPay = open && me && !isIssuer && (anyone || same(invoice.payer, me))
  const overdue = open && invoice.dueAt !== 0n && BigInt(now) > invoice.dueAt
  const link = base ? `${base}/invoices?invoice=${id.toString()}` : null
  const status = invoice.status === InvoiceStatus.Paid ? 'Paid' : invoice.status === InvoiceStatus.Cancelled ? 'Cancelled' : overdue ? 'Overdue' : 'Open'
  const color = status === 'Paid' ? 'var(--emerald)' : status === 'Overdue' ? 'var(--amber)' : status === 'Cancelled' ? 'var(--muted)' : '#a5b4fc'

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy', { id: 'copy-failed', description: 'Select the link and copy it by hand.' })
    }
  }

  return (
    <article className="glass space-y-3 p-5" style={highlight ? { borderColor: 'var(--border-hot)' } : undefined} aria-label={`Invoice ${id.toString()}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">
            Invoice #{id.toString()} <span className="tabular-nums" style={{ color: 'var(--muted)' }}>· {formatUsdc(invoice.amount)} USDC</span>
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            From <span className="mono">{shortAddress(invoice.issuer)}</span>
            {isIssuer && ' (you)'} · {anyone ? 'anyone can pay' : <>payable by <span className="mono">{shortAddress(invoice.payer)}</span>{me && same(invoice.payer, me) && ' (you)'}</>}
          </p>
        </div>
        <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ color, background: 'rgba(255,255,255,0.05)' }}>{status}</span>
      </div>
      {invoice.memo && <p className="text-sm text-pretty">{invoice.memo}</p>}
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Created {fullDate(Number(invoice.createdAt))}
        {invoice.dueAt !== 0n && ` · due ${fullDate(Number(invoice.dueAt))}`}
        {invoice.status === InvoiceStatus.Paid && ` · paid ${fullDate(Number(invoice.paidAt))} by ${shortAddress(invoice.paidBy)}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {canPay && (
          <button type="button" onClick={onPay} disabled={busy} className="cta min-h-10 px-5 text-sm font-semibold">
            Pay {formatUsdc(invoice.amount)} USDC
          </button>
        )}
        {isIssuer && open && (
          <button type="button" onClick={onCancel} disabled={busy} className="ghost-btn min-h-10 border px-4 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
            Cancel invoice
          </button>
        )}
        {link && (
          <button type="button" onClick={() => void copy()} className="ghost-btn flex min-h-10 items-center gap-1.5 border px-4 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
            {copied ? <Check className="size-4" style={{ color: 'var(--emerald)' }} aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        )}
        {link && typeof navigator !== 'undefined' && 'share' in navigator && (
          <button type="button" onClick={() => void navigator.share({ title: `Invoice #${id.toString()}`, url: link }).catch(() => undefined)} className="ghost-btn flex min-h-10 items-center gap-1.5 border px-4 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
            <Share2 className="size-4" aria-hidden="true" />
            Share
          </button>
        )}
      </div>
    </article>
  )
}

export function InvoicesPage() {
  const app = useApp()
  const now = useNow()
  const tx = useOnchainTx()
  const base = useShareBase()
  const route = useRoute()
  const list = useInvoices(app.address)
  const linkedParam = new URLSearchParams(route.search).get('invoice')
  const linkedId = linkedParam && /^\d{1,12}$/.test(linkedParam) ? BigInt(linkedParam) : undefined
  const linked = useInvoice(linkedId)

  const [payer, setPayer] = useState('')
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState('')
  const [memo, setMemo] = useState('')

  const raw = parseUsdcInput(amount)
  const problems: string[] = []
  if (!raw) problems.push('Enter the invoice amount.')
  if (payer && !isAddress(payer)) problems.push('The payer address is not valid.')
  if (payer && app.address && payer.toLowerCase() === app.address.toLowerCase()) problems.push('You cannot invoice yourself.')
  if (noteBytes(memo) > 280) problems.push('The memo is too long (280 bytes at most).')
  const ready = problems.length === 0 && Boolean(app.address) && !tx.busy

  async function create() {
    if (!FLOWS_ADDRESS || !raw) return
    const receipt = await tx.run({
      address: FLOWS_ADDRESS,
      abi: flowsAbi,
      functionName: 'createInvoice',
      args: [(payer && isAddress(payer) ? payer : zeroAddress), raw, endOfDayUnix(due), memo.trim()],
      title: 'Creating invoice',
      success: 'Invoice created. Copy its link to share it.',
    })
    if (receipt) {
      setAmount('')
      setMemo('')
      setDue('')
      setPayer('')
    }
  }

  const pay = (id: bigint, value: bigint) => {
    if (!FLOWS_ADDRESS) return
    void tx.run({ address: FLOWS_ADDRESS, abi: flowsAbi, functionName: 'payInvoice', args: [id], approveAmount: value, title: 'Paying invoice', success: 'Invoice paid' })
  }
  const cancel = (id: bigint) => {
    if (!FLOWS_ADDRESS) return
    void tx.run({ address: FLOWS_ADDRESS, abi: flowsAbi, functionName: 'cancelInvoice', args: [id], title: 'Cancelling invoice', success: 'Invoice cancelled' })
  }

  const rows = list.data ?? []
  const shownLinked = linkedId !== undefined && linked.data && linked.data.issuer !== zeroAddress ? linked.data : null

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader />
      <div className="mb-4">
        <EcosystemBadges show={['arc', 'usdc']} />
      </div>
      <ContractGate address={FLOWS_ADDRESS} env={FLOWS_ENV} kind="flows" feature="Invoices">
        <div className="space-y-4">
          {linkedId !== undefined && (
            <section aria-label="Linked invoice" className="space-y-2">
              <h2 className="eyebrow">Invoice from a link</h2>
              {linked.isPending ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading invoice #{linkedId.toString()}...</p>
              ) : shownLinked ? (
                <InvoiceCard id={linkedId} invoice={shownLinked} me={app.address} now={now} busy={tx.busy} base={base} onPay={() => pay(linkedId, shownLinked.amount)} onCancel={() => cancel(linkedId)} highlight />
              ) : (
                <p className="text-sm" style={{ color: 'var(--amber)' }} role="alert">Invoice #{linkedId.toString()} was not found on this contract.</p>
              )}
              {!app.isConnected && (
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <button type="button" onClick={show} className="cta min-h-10 px-5 text-sm font-semibold">Connect Wallet to pay</button>
                  )}
                </ConnectKitButton.Custom>
              )}
            </section>
          )}

          <section className="glass space-y-4 p-5 sm:p-6" aria-labelledby="inv-create">
            <div>
              <h2 id="inv-create" className="text-lg font-semibold">Create an invoice</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                The invoice is recorded onchain. When someone pays it, USDC goes straight from their wallet to yours, and the invoice flips to Paid.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow">Amount (USDC)</span>
                <input inputMode="decimal" value={amount} onChange={(e) => AMOUNT_INPUT_RE.test(e.target.value) && setAmount(e.target.value)} placeholder="0.00" className={`${inputClass} mt-1.5 tabular-nums`} />
              </label>
              <label className="block">
                <span className="eyebrow">Due date (optional)</span>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${inputClass} mt-1.5`} style={{ colorScheme: 'dark' }} />
              </label>
            </div>
            <label className="block">
              <span className="eyebrow">Only this wallet can pay (optional)</span>
              <input value={payer} onChange={(e) => setPayer(e.target.value.trim())} placeholder="0x... leave empty to let anyone pay" className={`${inputClass} mono mt-1.5`} autoComplete="off" spellCheck={false} />
            </label>
            <label className="block">
              <span className="eyebrow">Memo</span>
              <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this invoice for?" className={`${inputClass} mt-1.5`} />
            </label>
            {problems.length > 0 && (amount || payer) && (
              <ul className="space-y-1 text-xs" style={{ color: 'var(--amber)' }} role="alert">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
            {app.isConnected ? (
              <button type="button" onClick={() => void create()} disabled={!ready} className="cta min-h-12 w-full text-base font-semibold">
                {tx.busy ? 'Working...' : 'Create invoice'}
              </button>
            ) : (
              <ConnectKitButton.Custom>
                {({ show }) => <button type="button" onClick={show} className="cta min-h-12 w-full text-base font-semibold">Connect Wallet</button>}
              </ConnectKitButton.Custom>
            )}
          </section>

          <section aria-labelledby="inv-list" className="space-y-3">
            <h2 id="inv-list" className="eyebrow">Your invoices</h2>
            {!app.address ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to see invoices you issued or need to pay.</p>
            ) : list.isPending ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading invoices...</p>
            ) : list.isError ? (
              <p className="text-sm" style={{ color: 'var(--amber)' }} role="alert">Could not load invoices. Check your connection.</p>
            ) : rows.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No invoices yet.</p>
            ) : (
              rows.map((r) => <InvoiceCard key={r.id.toString()} id={r.id} invoice={r.invoice} me={app.address} now={now} busy={tx.busy} base={base} onPay={() => pay(r.id, r.invoice.amount)} onCancel={() => cancel(r.id)} />)
            )}
          </section>
        </div>
      </ContractGate>
      {tx.progress}
    </div>
  )
}
