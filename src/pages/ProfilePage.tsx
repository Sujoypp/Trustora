import { useState } from 'react'
import { useBytecode, useTransactionCount } from 'wagmi'
import { isAddress, type Address } from 'viem'
import { Check, Copy, ExternalLink, Search, Share2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, LoadingState } from '@/components/states'
import { SyncNotice } from '@/components/ActivityFeed'
import { useNow } from '@/hooks/useNow'
import { useShareBase } from '@/hooks/useShareBase'
import { usePaymentHistory } from '@/hooks/usePaymentHistory'
import { useTrustScore } from '@/hooks/useTrustScore'
import { useTrustRecords } from '@/hooks/useTrustoraData'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { useApp } from '@/lib/appContext'
import { computeAnalytics } from '@/lib/analytics'
import { fullDate, shortAddress } from '@/lib/format'
import { navigate, useRoute } from '@/lib/router'
import { CHAIN_ID, NETWORK_NAME, ROUTER_ADDRESS } from '@/lib/trustora'
import { buildAddressExplorerUrl } from '@/onchain-facts'

const inputClass = 'glass-inner w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-[#64748B]'

function Avatar({ address }: { address: string }) {
  const a = parseInt(address.slice(2, 5), 16) % 360
  return <span className="size-14 shrink-0 rounded-full" style={{ background: `conic-gradient(from 90deg, hsl(${a} 80% 62%), hsl(${(a + 70) % 360} 80% 58%), hsl(${a} 80% 62%))` }} aria-hidden="true" />
}

function Ring({ score }: { score: number }) {
  const r = 42
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img" aria-label={`Trust score ${score} out of 100`}>
      <defs>
        <linearGradient id="profile-ring" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#4f8cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(130,170,255,0.14)" strokeWidth="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="url(#profile-ring)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
    </svg>
  )
}

/** The profile of one wallet. Everything shown is read from public Arc Mainnet data. */
function Profile({ address, isMe }: { address: Address; isMe: boolean }) {
  const app = useApp()
  const base = useShareBase()
  const [copied, setCopied] = useState<'address' | 'link' | null>(null)
  const history = usePaymentHistory(address)
  const { balance } = useUsdcBalance(address)
  const { data: nonce } = useTransactionCount({ address, chainId: CHAIN_ID })
  const { data: code } = useBytecode({ address, chainId: CHAIN_ID })
  const trust = useTrustScore(address, balance?.raw, history.payments)
  const records = useTrustRecords(address)
  const now = useNow(60_000)
  const stats = computeAnalytics(history.payments, now, null)
  const first = history.payments.length ? Math.min(...history.payments.map((p) => p.timestamp)) : null
  const score = trust.result

  async function copy(kind: 'address' | 'link') {
    const value = kind === 'address' ? address : base ? `${base}/profile?address=${address}` : ''
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      toast.error('Could not copy', { id: 'copy-failed', description: 'Select the text and copy it by hand.' })
    }
  }

  return (
    <div className="space-y-4">
      <section className="glass flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <Avatar address={address} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{isMe ? 'Your wallet' : 'Wallet'}</p>
          <p className="mono mt-1 break-all text-sm">{address}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy('address')} className="ghost-btn flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold">
              {copied === 'address' ? <Check className="size-3.5" style={{ color: 'var(--emerald)' }} aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              {copied === 'address' ? 'Copied!' : 'Copy address'}
            </button>
            <button type="button" onClick={() => void copy('link')} disabled={!base} className="ghost-btn flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold">
              {copied === 'link' ? <Check className="size-3.5" style={{ color: 'var(--emerald)' }} aria-hidden="true" /> : <Share2 className="size-3.5" aria-hidden="true" />}
              {copied === 'link' ? 'Copied!' : 'Copy profile link'}
            </button>
            <a href={buildAddressExplorerUrl(CHAIN_ID, address)} target="_blank" rel="noopener noreferrer" className="ghost-btn flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold">
              <ExternalLink className="size-3.5" aria-hidden="true" /> Explorer
            </a>
          </div>
        </div>
      </section>

      <section className="glass p-5 sm:p-6" aria-labelledby="tp-score">
        <h2 id="tp-score" className="display text-lg font-semibold">Trust score</h2>
        {!score ? (
          <div className="mt-3"><LoadingState label="Reading the wallet from the network" rows={2} /></div>
        ) : (
          <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Ring score={score.score} />
                <span className="display absolute inset-0 flex items-center justify-center text-2xl font-bold tabular-nums">{score.score}</span>
              </div>
              <div>
                <p className="display text-xl font-semibold">{score.tier}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>out of 100</p>
              </div>
            </div>
            <ul className="grid flex-1 gap-2.5">
              {score.factors.map((f) => (
                <li key={f.id}>
                  <span className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium">{f.label} <span style={{ color: 'var(--subtle)' }}>· {f.detail}</span></span>
                    <span className="tabular-nums" style={{ color: 'var(--muted)' }}>{f.points}/{f.max}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <span className="block h-full rounded-full" style={{ width: `${(f.points / f.max) * 100}%`, background: 'linear-gradient(90deg, #4f8cff, #22d3ee)' }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-xs" style={{ color: 'var(--subtle)' }}>
          Calculated in your browser from public {NETWORK_NAME} data: wallet activity, payments through the Trustora contract, and completed escrow milestones, invoices and recurring payments. It is a Trustora signal, not a credit rating.
        </p>
      </section>

      <section className="glass p-5 sm:p-6" aria-labelledby="tp-activity">
        <h2 id="tp-activity" className="display text-lg font-semibold">Verified activity</h2>
        <SyncNotice progress={history.progress} error={history.error} />
        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Transactions sent', nonce === undefined ? '...' : String(nonce)],
            ['Account type', code === undefined ? '...' : code && code !== '0x' ? 'Smart contract' : 'Standard wallet'],
            ['Trustora payments', ROUTER_ADDRESS ? String(stats.count) : 'Not set up'],
            ['Counterparties', ROUTER_ADDRESS ? String(stats.counterparties.length === 6 ? '6+' : stats.counterparties.length) : 'Not set up'],
            ['First payment', first ? fullDate(first) : 'None yet'],
            ['Escrow milestones completed', String(records.milestones)],
            ['Invoices settled', String(records.invoicesSettled)],
            ['Recurring payments made', String(records.scheduled)],
          ].map(([label, value]) => (
            <div key={label} className="glass-inner p-3.5">
              <dt className="eyebrow">{label}</dt>
              <dd className="display mt-1 text-sm font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {!isMe && app.address && <p className="mt-3 text-xs" style={{ color: 'var(--subtle)' }}>Showing public data for {shortAddress(address)}. Payments are counted from the Trustora payment contract only.</p>}
      </section>
    </div>
  )
}

/** Wallet Trust Profile: look up any wallet, or open your own, and share the link. */
export function ProfilePage() {
  const app = useApp()
  const route = useRoute()
  const param = new URLSearchParams(route.search).get('address')
  const target = param && isAddress(param) ? (param) : app.address
  const [input, setInput] = useState('')
  const invalid = input.trim() !== '' && !isAddress(input.trim())

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader />
      <form
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (isAddress(input.trim())) navigate(`/profile?address=${input.trim()}`)
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Look up any wallet: 0x..." aria-label="Wallet address to look up" aria-invalid={invalid} className={`${inputClass} mono`} autoComplete="off" spellCheck={false} />
        <button type="submit" disabled={!input.trim() || invalid} className="cta flex min-h-11 items-center justify-center gap-2 px-6 text-sm">
          <Search className="size-4" aria-hidden="true" /> Look up
        </button>
      </form>
      {invalid && <p className="-mt-2 mb-3 text-xs" style={{ color: 'var(--amber)' }} role="alert">That is not a valid wallet address.</p>}
      {param && !isAddress(param) && <p className="mb-3 text-xs" style={{ color: 'var(--amber)' }} role="alert">The address in the link is not valid.</p>}
      {target ? (
        <Profile key={target} address={target} isMe={Boolean(app.address && target.toLowerCase() === app.address.toLowerCase())} />
      ) : (
        <EmptyState icon={UserRound} title="Connect a wallet or look one up" description="Connect your wallet to see your own trust profile, or paste any wallet address above." />
      )}
    </div>
  )
}
