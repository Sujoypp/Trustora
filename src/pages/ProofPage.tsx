import { useState } from 'react'
import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { decodeEventLog, isHex, type Hex } from 'viem'
import { Check, ChevronDown, Copy, ExternalLink, Search } from 'lucide-react'
import { toast } from 'sonner'
import { EcosystemBadges } from '@/components/EcosystemBadges'
import { PageHeader } from '@/components/PageHeader'
import { TxLink } from '@/components/TxLink'
import { useCreationTx, useEscrowDeals, useInvoices, useSchedules, useSplits, type RecordKind } from '@/hooks/useTrustoraData'
import { useApp } from '@/lib/appContext'
import { ESCROW_ADDRESS, FLOWS_ADDRESS, escrowAbi, flowsAbi } from '@/lib/contracts'
import { formatUsdc, fullDate, shortAddress } from '@/lib/format'
import { CHAIN, CHAIN_ID, NETWORK_NAME, ROUTER_ADDRESS, trustoraAbi } from '@/lib/trustora'
import { buildTxExplorerUrl } from '@/onchain-facts'

const inputClass = 'glass-inner w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-[#64748B]'

const jsonSafe = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))) as unknown

/** Reads a transaction straight from the Arc RPC and decodes the events it emitted on the Trustora contracts. */
function useProof(hash: Hex | null) {
  const client = usePublicClient({ chainId: CHAIN_ID })
  return useQuery({
    queryKey: ['trustora', 'proof', hash],
    enabled: Boolean(hash && client),
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      if (!client || !hash) return null
      const receipt = await client.getTransactionReceipt({ hash })
      const known = [
        { label: 'TrustoraPay', address: ROUTER_ADDRESS, abi: trustoraAbi },
        { label: 'TrustoraEscrow', address: ESCROW_ADDRESS, abi: escrowAbi },
        { label: 'TrustoraFlows', address: FLOWS_ADDRESS, abi: flowsAbi },
      ]
      const events = receipt.logs.flatMap((log) => {
        const match = known.find((k) => k.address && k.address.toLowerCase() === log.address.toLowerCase())
        if (!match) return []
        try {
          const decoded = decodeEventLog({ abi: match.abi as never, data: log.data, topics: log.topics })
          return [{ contract: match.label, address: log.address, event: String(decoded.eventName), args: jsonSafe(decoded.args) }]
        } catch {
          return []
        }
      })
      return {
        network: NETWORK_NAME,
        chainId: CHAIN_ID,
        txHash: hash,
        status: receipt.status,
        blockNumber: receipt.blockNumber.toString(),
        from: receipt.from,
        to: receipt.to,
        events,
        explorer: buildTxExplorerUrl(CHAIN_ID, hash),
      }
    },
  })
}

function ProofResult({ hash }: { hash: Hex }) {
  const proof = useProof(hash)
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!proof.data) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(proof.data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy', { id: 'copy-failed', description: 'Select the proof text and copy it by hand.' })
    }
  }

  if (proof.isPending) return <p className="text-sm" style={{ color: 'var(--muted)' }}>Reading the transaction from {NETWORK_NAME}...</p>
  if (proof.isError || !proof.data) {
    return (
      <p className="text-sm" style={{ color: 'var(--amber)' }} role="alert">
        No confirmed transaction with this hash was found on {NETWORK_NAME}. Check the hash and the network.
      </p>
    )
  }
  const p = proof.data
  const ok = p.status === 'success'
  return (
    <div className="space-y-3" aria-live="polite">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold" style={{ color: ok ? 'var(--emerald)' : 'var(--danger)' }}>{ok ? 'Confirmed on Arc Mainnet' : 'Transaction failed onchain'}</span>
        <span style={{ color: 'var(--muted)' }}>Block {Number(p.blockNumber).toLocaleString()} · from <span className="mono">{shortAddress(p.from)}</span></span>
        <TxLink hash={p.txHash} />
      </p>
      {p.events.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>This transaction did not emit any event from a Trustora contract configured in this app.</p>
      ) : (
        <ul className="space-y-2">
          {p.events.map((e, i) => (
            <li key={i} className="glass-inner p-3 text-xs">
              <p className="font-semibold" style={{ color: '#c7d2fe' }}>{e.contract}.{e.event}</p>
              <pre className="mono mt-1 overflow-x-auto whitespace-pre-wrap break-all" style={{ color: 'var(--muted)' }}>{JSON.stringify(e.args, null, 2)}</pre>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => void copy()} className="ghost-btn flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
        {copied ? <Check className="size-3.5" style={{ color: 'var(--emerald)' }} aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        {copied ? 'Copied!' : 'Copy proof (JSON)'}
      </button>
    </div>
  )
}

function RecordRow({ kind, id, block, title, detail, onVerify }: { kind: RecordKind; id: bigint; block: bigint; title: string; detail: string; onVerify: (hash: Hex) => void }) {
  const [open, setOpen] = useState(false)
  const found = useCreationTx(kind, id, block, open)
  return (
    <li className="glass-inner p-3 text-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="font-medium">{title}</span> <span style={{ color: 'var(--muted)' }}>· {detail}</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
          {found.isPending ? <span>Looking up the transaction...</span> : found.data ? (
            <>
              <TxLink hash={found.data} />
              <button type="button" onClick={() => onVerify(found.data as Hex)} className="underline" style={{ color: '#a5b4fc' }}>Verify this transaction</button>
            </>
          ) : <span>The creation transaction could not be found.</span>}
        </div>
      )}
    </li>
  )
}

export function ProofPage() {
  const app = useApp()
  const deals = useEscrowDeals(app.address).data ?? []
  const invoices = useInvoices(app.address).data ?? []
  const schedules = useSchedules(app.address).data ?? []
  const splits = useSplits(app.address).data ?? []
  const [input, setInput] = useState('')
  const [hash, setHash] = useState<Hex | null>(null)
  const payments = app.history.payments.slice(0, 15)

  const verify = (value: string) => {
    const v = value.trim()
    if (isHex(v) && v.length === 66) setHash(v)
    else toast.error('That is not a transaction hash', { id: 'bad-hash', description: 'A hash starts with 0x and has 64 more characters.' })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader />
      <div className="mb-4">
        <EcosystemBadges show={['arc', 'usdc']} />
      </div>
      <div className="space-y-4">
        <section className="glass space-y-4 p-5 sm:p-6" aria-labelledby="proof-verify">
          <div>
            <h2 id="proof-verify" className="text-lg font-semibold">Verify a transaction</h2>
            <p className="mt-1 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
              Paste any transaction hash. The app reads it straight from the {NETWORK_NAME} network, checks that it confirmed, and decodes what the Trustora contracts recorded. The proof you copy contains the hash, block and events, so anyone can check it on the explorer.
            </p>
          </div>
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); verify(input) }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x... transaction hash" aria-label="Transaction hash" className={`${inputClass} mono`} autoComplete="off" spellCheck={false} />
            <button type="submit" className="cta flex min-h-11 items-center justify-center gap-2 px-6 text-sm font-semibold">
              <Search className="size-4" aria-hidden="true" />
              Verify
            </button>
          </form>
          {hash && <ProofResult hash={hash} />}
        </section>

        <section className="glass space-y-3 p-5 sm:p-6" aria-labelledby="proof-records">
          <h2 id="proof-records" className="text-lg font-semibold">Your onchain records</h2>
          {!app.address ? <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to list your records.</p> : (
            <>
              {payments.length === 0 && deals.length + invoices.length + schedules.length + splits.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Nothing recorded yet. Payments, deals, invoices, schedules and splits you make appear here.</p>
              )}
              <ul className="space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="glass-inner flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <span>
                      <span className="font-medium">{p.direction === 'received' ? 'Received' : 'Sent'} {formatUsdc(p.amountRaw)} USDC</span>{' '}
                      <span style={{ color: 'var(--muted)' }}>· {fullDate(p.timestamp)}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs">
                      <TxLink hash={p.txHash} />
                      <button type="button" onClick={() => { setInput(p.txHash); setHash(p.txHash) }} className="underline" style={{ color: '#a5b4fc' }}>Verify</button>
                    </span>
                  </li>
                ))}
                {deals.map((d) => <RecordRow key={`e${d.id}`} kind="escrow" id={d.id} block={d.agreement.createdBlock} title={`Escrow deal #${d.id}`} detail={`${formatUsdc(d.agreement.total)} USDC`} onVerify={(h) => { setInput(h); setHash(h) }} />)}
                {invoices.map((r) => <RecordRow key={`i${r.id}`} kind="invoice" id={r.id} block={r.invoice.createdBlock} title={`Invoice #${r.id}`} detail={`${formatUsdc(r.invoice.amount)} USDC`} onVerify={(h) => { setInput(h); setHash(h) }} />)}
                {schedules.map((r) => <RecordRow key={`s${r.id}`} kind="schedule" id={r.id} block={r.schedule.createdBlock} title={`Recurring schedule #${r.id}`} detail={`${formatUsdc(r.schedule.amount)} USDC`} onVerify={(h) => { setInput(h); setHash(h) }} />)}
                {splits.map((r) => <RecordRow key={`p${r.id}`} kind="split" id={r.id} block={r.split.createdBlock} title={`Split payment #${r.id}`} detail={`${formatUsdc(r.split.total)} USDC to ${r.split.count} wallets`} onVerify={(h) => { setInput(h); setHash(h) }} />)}
              </ul>
              <a href={CHAIN.explorerBase} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline" style={{ color: '#a5b4fc' }}>
                Open the Arc Explorer <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
