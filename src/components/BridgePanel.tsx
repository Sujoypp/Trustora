import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { ConnectKitButton } from 'connectkit'
import { ArrowRight, ArrowRightLeft, Check, ExternalLink, Info, Loader2, TriangleAlert } from 'lucide-react'
import type { BridgeResult } from '@circle-fin/app-kit'
import { DynamicFeeNote } from '@/components/DynamicFeeNote'
import { FailureNotice } from '@/components/FailureNotice'
import { BRIDGE_CHAINS, createWalletAdapter, getKit, type BridgeChainName } from '@/lib/circleKit'
import { notifyError, type ErrorInfo } from '@/lib/errors'
import { formatDecimalString } from '@/lib/tokenFormat'
import { shortAddress } from '@/lib/format'
import { NETWORK_NAME } from '@/lib/trustora'
import { useCctpReadiness } from '@/lib/cctp'

const ARC = BRIDGE_CHAINS[0]
const OTHERS = BRIDGE_CHAINS.slice(1)
const AMOUNT_RE = /^\d{0,9}(\.\d{0,6})?$/
const chainLabel = (name: BridgeChainName) => BRIDGE_CHAINS.find((c) => c.kit === name)?.label ?? name

interface Quote {
  key: string
  fees?: { label: string; value: string }[]
  otherGas?: boolean
  error?: string
}

/** Circle CCTP bridge for native USDC into or out of Arc Mainnet, using Circle's Forwarding Service for the mint. */
export function BridgePanel() {
  const { address, connector, isConnected } = useAccount()
  const queryClient = useQueryClient()
  const cctp = useCctpReadiness()
  const [other, setOther] = useState<Exclude<BridgeChainName, 'Arc'>>('Ethereum')
  const [into, setInto] = useState(true)
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ErrorInfo | null>(null)
  const [result, setResult] = useState<BridgeResult | null>(null)

  const fromName: BridgeChainName = into ? other : 'Arc'
  const toName: BridgeChainName = into ? 'Arc' : other
  const fromChain = BRIDGE_CHAINS.find((c) => c.kit === fromName)!.chain
  const valid = /^\d*\.?\d+$/.test(amount) && Number(amount) > 0
  const key = isConnected && valid && address ? `${address}|${fromName}|${toName}|${amount}` : null
  const current = quote && quote.key === key ? quote : null
  const loading = key !== null && current === null

  useEffect(() => {
    if (!key || !connector) return
    const ctx = { cancelled: false }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [kit, adapter] = await Promise.all([getKit(), createWalletAdapter(connector)])
          const est = await kit.estimateBridge({ from: { adapter, chain: fromName }, to: { adapter, chain: toName, useForwarder: true }, amount })
          const fees: { label: string; value: string }[] = []
          let otherGas = false
          for (const f of est.fees) if (f.amount) fees.push({ label: `${f.type} fee`, value: `${formatDecimalString(f.amount, 6)} ${f.token}` })
          for (const g of est.gasFees) {
            if (!g.fees) continue
            if (g.token !== 'USDC') otherGas = true
            fees.push({ label: `Gas on ${chainLabel(g.blockchain as BridgeChainName)} (${g.name})`, value: `${formatDecimalString(g.fees.fee, 6)} ${g.token}` })
          }
          if (!ctx.cancelled) setQuote({ key, fees, otherGas })
        } catch (e) {
          if (!ctx.cancelled) setQuote({ key, error: e instanceof Error ? e.message.slice(0, 140) : 'No quote is available right now.' })
        }
      })()
    }, 300)
    return () => {
      ctx.cancelled = true
      clearTimeout(timer)
    }
  }, [key, connector, fromName, toName, amount])

  async function bridge() {
    if (!connector) return
    setBusy(true)
    setResult(null)
    setFailure(null)
    try {
      const [kit, adapter] = await Promise.all([getKit(), createWalletAdapter(connector, fromChain)])
      const res = await kit.bridge({ from: { adapter, chain: fromName }, to: { adapter, chain: toName, useForwarder: true }, amount })
      setResult(res)
      if (res.state === 'success') {
        setAmount('')
        setQuote(null)
        void queryClient.invalidateQueries()
      }
    } catch (e) {
      setFailure(notifyError(e))
    } finally {
      setBusy(false)
    }
  }

  async function retry() {
    if (!connector || !result) return
    setBusy(true)
    try {
      const [kit, adapter] = await Promise.all([getKit(), createWalletAdapter(connector, fromChain)])
      setResult(await kit.retryBridge(result, { from: adapter, to: adapter }))
      void queryClient.invalidateQueries()
    } catch (e) {
      setFailure(notifyError(e))
    } finally {
      setBusy(false)
    }
  }

  const failed = result?.steps.find((s) => s.state === 'error')

  return (
    <section className="glass space-y-4 p-5 sm:p-6" aria-labelledby="bridge-title">
      <div>
        <h2 id="bridge-title" className="text-lg font-semibold">
          CCTP Bridge
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Move native USDC between {NETWORK_NAME} and other chains with Circle&apos;s Cross-Chain Transfer Protocol: USDC is burned on one chain and minted on the other.
        </p>
        <p className="mt-2 text-xs font-medium" style={{ color: cctp === 'ready' ? 'var(--emerald)' : 'var(--amber)' }}>
          {cctp === 'ready' ? 'CCTP is live on Arc Mainnet' : cctp === 'checking' ? 'Checking CCTP...' : 'CCTP is not responding on Arc Mainnet right now'}
        </p>
      </div>

      <div className="glass-inner grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1">From</p>
          {into ? (
            <select aria-label="Source chain" value={other} onChange={(e) => setOther(e.target.value as Exclude<BridgeChainName, 'Arc'>)} className="w-full rounded-lg bg-transparent py-1 text-sm font-semibold">
              {OTHERS.map((c) => (
                <option key={c.kit} value={c.kit} className="bg-[#0C101B]">
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="py-1 text-sm font-semibold">{ARC.label}</p>
          )}
        </div>
        <button type="button" onClick={() => setInto(!into)} aria-label="Flip the bridge direction" className="ghost-btn flex size-10 items-center justify-center border" style={{ borderColor: 'var(--border)' }}>
          <ArrowRightLeft className="size-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 text-right">
          <p className="eyebrow mb-1">To</p>
          {into ? (
            <p className="py-1 text-sm font-semibold">{ARC.label}</p>
          ) : (
            <select aria-label="Destination chain" value={other} onChange={(e) => setOther(e.target.value as Exclude<BridgeChainName, 'Arc'>)} className="w-full rounded-lg bg-transparent py-1 text-right text-sm font-semibold">
              {OTHERS.map((c) => (
                <option key={c.kit} value={c.kit} className="bg-[#0C101B]">
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="glass-inner p-4">
        <label htmlFor="bridge-amount" className="eyebrow">
          Amount (USDC)
        </label>
        <input
          id="bridge-amount"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => AMOUNT_RE.test(e.target.value) && (setAmount(e.target.value), setResult(null))}
          className="display mt-2 w-full bg-transparent text-3xl font-semibold tabular-nums outline-none placeholder:text-white/20"
        />
      </div>

      {valid && (
        <dl className="space-y-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          <div className="flex justify-between gap-3">
            <dt>Route</dt>
            <dd className="flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
              {chainLabel(fromName)} <ArrowRight className="size-3" aria-hidden="true" /> {chainLabel(toName)}
            </dd>
          </div>
          {address && (
            <div className="flex justify-between gap-3">
              <dt>Recipient (your wallet)</dt>
              <dd className="mono" style={{ color: 'var(--ink)' }}>
                {shortAddress(address)}
              </dd>
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Estimating fees...
            </div>
          )}
          {current?.fees?.map((f) => (
            <div key={f.label} className="flex justify-between gap-3">
              <dt className="capitalize">{f.label}</dt>
              <dd className="tabular-nums" style={{ color: 'var(--ink)' }}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {current?.fees && <DynamicFeeNote nonUsdcGas={current.otherGas} />}
      <FailureNotice info={failure} onDismiss={() => setFailure(null)} />
      {current?.error && (
        <p className="flex items-start gap-2 text-xs" style={{ color: 'var(--amber)' }} role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Could not get a quote: {current.error}
        </p>
      )}

      {result && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: result.state === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(245,158,11,0.4)' }} role="status">
          <p className="flex items-center gap-2 font-semibold" style={{ color: result.state === 'success' ? 'var(--emerald)' : 'var(--amber)' }}>
            {result.state === 'success' ? <Check className="size-4" aria-hidden="true" /> : <TriangleAlert className="size-4" aria-hidden="true" />}
            {result.state === 'success' ? `Bridge complete: ${result.amount} USDC` : `Bridge stopped${failed ? ` at the ${failed.name} step` : ''}`}
          </p>
          <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--muted)' }}>
            {result.steps.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-3">
                <span className="capitalize">{s.name}</span>
                <span className="flex items-center gap-2">
                  <span style={{ color: s.state === 'success' ? 'var(--emerald)' : s.state === 'error' ? 'var(--danger)' : 'var(--muted)' }}>{s.state}</span>
                  {s.explorerUrl && (
                    <a href={s.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: '#a5b4fc' }}>
                      View <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {result.state !== 'success' && (
            <button onClick={() => void retry()} disabled={busy} className="cta mt-3 min-h-10 px-4 text-sm font-semibold">
              {busy ? 'Retrying...' : 'Resume from the failed step'}
            </button>
          )}
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        This moves real USDC between chains and cannot be undone. Start with a small amount. Circle&apos;s Forwarding Service submits the mint on the destination chain and charges a per-transfer fee shown above. Your wallet will be asked to switch to the source chain and to sign the approval and burn.
        {Number(amount) > 100 && ' This amount is above 100 USDC, so double-check the route.'}
      </p>

      {!isConnected ? (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button onClick={show} className="cta min-h-12 w-full text-base font-semibold">
              Connect Wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      ) : (
        <button onClick={() => void bridge()} disabled={!valid || busy || loading || Boolean(current?.error)} className="cta min-h-12 w-full text-base font-semibold">
          {busy ? 'Bridging... confirm in your wallet' : valid ? `Bridge ${amount} USDC to ${chainLabel(toName)}` : 'Enter an amount'}
        </button>
      )}
    </section>
  )
}
