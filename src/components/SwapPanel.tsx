import { useEffect, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { ConnectKitButton } from 'connectkit'
import { ArrowDownUp, Check, Info, Loader2, TriangleAlert } from 'lucide-react'
import type { SwapEstimate } from '@circle-fin/app-kit'
import { DynamicFeeNote } from '@/components/DynamicFeeNote'
import { FailureNotice } from '@/components/FailureNotice'
import { TxLink } from '@/components/TxLink'
import { createWalletAdapter, getKit } from '@/lib/circleKit'
import { useApp } from '@/lib/appContext'
import { notifyError, type ErrorInfo } from '@/lib/errors'
import { formatDecimalString } from '@/lib/tokenFormat'
import { CHAIN_ID, NETWORK_NAME } from '@/lib/trustora'
import { formatGwei, formatUnits, type Hex } from 'viem'

const TOKENS = [
  { id: 'USDC', label: 'USDC' },
  { id: 'EURC', label: 'EURC' },
  { id: 'CIRBTC', label: 'cirBTC' },
] as const
type TokenId = (typeof TOKENS)[number]['id']
const SLIPPAGE = [
  { bps: 50, label: '0.5%' },
  { bps: 100, label: '1%' },
  { bps: 300, label: '3%' },
] as const

const AMOUNT_RE = /^\d{0,9}(\.\d{0,8})?$/
const decimalsOf = (id: TokenId) => (id === 'CIRBTC' ? 8 : 6)
const label = (id: TokenId) => TOKENS.find((t) => t.id === id)?.label ?? id

interface Quote {
  key: string
  estimate?: SwapEstimate
  error?: string
}

/** Circle Swap on Arc Mainnet: live rate preview, then one explicit Swap click. Runs through Circle's App Kit. */
export function SwapPanel() {
  const { address, connector, chainId, isConnected } = useAccount()
  const { switchChainAsync, isPending: switching } = useSwitchChain()
  const queryClient = useQueryClient()
  const [from, setFrom] = useState<TokenId>('USDC')
  const [to, setTo] = useState<TokenId>('EURC')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState<number>(100)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ErrorInfo | null>(null)
  const { gasPrice, balance } = useApp()
  const [done, setDone] = useState<{ hash?: Hex; out?: string; token: TokenId } | null>(null)

  // Quick amounts. MAX is only offered for USDC, whose balance the app already knows; it keeps 0.05 USDC back for network fees.
  const presets = from === 'CIRBTC' ? ['0.001', '0.01', '0.1'] : from === 'USDC' ? ['10', '50', '100', 'MAX'] : ['10', '50', '100']
  const FEE_RESERVE = 50_000n
  const maxAmount = from === 'USDC' && balance && balance.raw > FEE_RESERVE ? formatUnits(balance.raw - FEE_RESERVE, 6) : null
  const applyPreset = (preset: string) => {
    const value = preset === 'MAX' ? maxAmount : preset
    if (value === null) return
    setAmount(value)
    setDone(null)
    setFailure(null)
  }

  const onArc = isConnected && chainId === CHAIN_ID
  const valid = /^\d*\.?\d+$/.test(amount) && Number(amount) > 0
  const key = onArc && valid && address ? `${address}|${from}|${to}|${amount}|${slippage}` : null
  const current = quote && quote.key === key ? quote : null
  const loading = key !== null && current === null

  useEffect(() => {
    if (!key || !connector) return
    const ctx = { cancelled: false }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [kit, adapter] = await Promise.all([getKit(), createWalletAdapter(connector)])
          const estimate = await kit.estimateSwap({ from: { adapter, chain: 'Arc' }, tokenIn: from, tokenOut: to, amountIn: amount, config: { slippageBps: slippage } })
          if (!ctx.cancelled) setQuote({ key, estimate })
        } catch (e) {
          if (!ctx.cancelled) setQuote({ key, error: e instanceof Error ? e.message.slice(0, 140) : 'No route is available right now.' })
        }
      })()
    }, 300)
    return () => {
      ctx.cancelled = true
      clearTimeout(timer)
    }
  }, [key, connector, from, to, amount, slippage])

  function pick(side: 'from' | 'to', id: TokenId) {
    setDone(null)
    if (side === 'from') {
      setFrom(id)
      if (id === to) setTo(from)
    } else {
      setTo(id)
      if (id === from) setFrom(to)
    }
  }

  async function swap() {
    if (!connector || !current?.estimate) return
    setBusy(true)
    setFailure(null)
    try {
      const [kit, adapter] = await Promise.all([getKit(), createWalletAdapter(connector)])
      const result = await kit.swap({ from: { adapter, chain: 'Arc' }, tokenIn: from, tokenOut: to, amountIn: amount, config: { slippageBps: slippage } })
      setDone({ hash: result.txHash as Hex | undefined, out: result.amountOut, token: to })
      setAmount('')
      setQuote(null)
      void queryClient.invalidateQueries()
    } catch (e) {
      setFailure(notifyError(e))
    } finally {
      setBusy(false)
    }
  }

  const est = current?.estimate
  const rate = est && Number(amount) > 0 ? Number(est.estimatedOutput.amount) / Number(amount) : null
  const big = from === 'USDC' && Number(amount) > 100

  return (
    <section className="glass space-y-4 p-5 sm:p-6" aria-labelledby="swap-title">
      <div>
        <h2 id="swap-title" className="text-lg font-semibold">
          Circle Swap
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Swap USDC, EURC and cirBTC on {NETWORK_NAME}. On Arc, native gas and USDC are the same asset, so there is nothing to swap between them.
        </p>
      </div>

      {done && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: 'rgba(52,211,153,0.3)', background: 'rgba(16,185,129,0.08)' }} role="status">
          <p className="flex items-center gap-2 font-semibold" style={{ color: 'var(--emerald)' }}>
            <Check className="size-4" aria-hidden="true" />
            Swap submitted{done.out ? `: received ${done.out} ${label(done.token)}` : ''}
          </p>
          {done.hash && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
              Transaction <TxLink hash={done.hash} />
            </p>
          )}
        </div>
      )}

      <div className="glass-inner p-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="swap-amount" className="eyebrow">
            You pay
          </label>
          <select aria-label="Token to pay with" value={from} onChange={(e) => pick('from', e.target.value as TokenId)} className="glass-inner rounded-lg bg-transparent px-2 py-1 text-sm font-semibold">
            {TOKENS.map((t) => (
              <option key={t.id} value={t.id} className="bg-[#0C101B]">
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <input
          id="swap-amount"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => {
            if (AMOUNT_RE.test(e.target.value)) {
              setAmount(e.target.value)
              setDone(null)
              setFailure(null)
            }
          }}
          className="display mt-2 w-full bg-transparent text-3xl font-semibold tabular-nums outline-none placeholder:text-white/20"
        />
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
              disabled={preset === 'MAX' && maxAmount === null}
              className="ghost-btn min-h-8 border px-3 text-xs font-semibold tabular-nums disabled:opacity-40"
              style={{ borderColor: 'var(--border)' }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="-my-2 flex justify-center">
        <button
          type="button"
          onClick={() => {
            setFrom(to)
            setTo(from)
          }}
          aria-label="Flip the swap direction"
          className="ghost-btn flex size-10 items-center justify-center border"
          style={{ borderColor: 'var(--border)' }}
        >
          <ArrowDownUp className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="glass-inner p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">You receive (estimate)</span>
          <select aria-label="Token to receive" value={to} onChange={(e) => pick('to', e.target.value as TokenId)} className="glass-inner rounded-lg bg-transparent px-2 py-1 text-sm font-semibold">
            {TOKENS.map((t) => (
              <option key={t.id} value={t.id} className="bg-[#0C101B]">
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <p className="display mt-2 min-h-9 text-3xl font-semibold tabular-nums" style={{ color: est ? 'var(--ink)' : 'var(--subtle)' }}>
          {loading ? <Loader2 className="size-6 animate-spin" aria-label="Estimating" /> : est ? formatDecimalString(est.estimatedOutput.amount, decimalsOf(to)) : '0.00'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Slippage tolerance">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          Slippage
        </span>
        {SLIPPAGE.map((s) => (
          <button
            key={s.bps}
            type="button"
            onClick={() => setSlippage(s.bps)}
            aria-pressed={slippage === s.bps}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150"
            style={{ borderColor: slippage === s.bps ? 'rgba(79,140,255,0.6)' : 'var(--border)', background: slippage === s.bps ? 'rgba(79,140,255,0.18)' : 'transparent', color: slippage === s.bps ? '#fff' : 'var(--muted)' }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {est && (
        <dl className="space-y-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          {rate !== null && (
            <div className="flex justify-between gap-3">
              <dt>Rate</dt>
              <dd className="tabular-nums" style={{ color: 'var(--ink)' }}>
                1 {label(from)} ≈ {formatDecimalString(rate.toFixed(8), decimalsOf(to))} {label(to)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt>Minimum received</dt>
            <dd className="tabular-nums" style={{ color: 'var(--ink)' }}>
              {formatDecimalString(est.stopLimit.amount, decimalsOf(to))} {label(to)}
            </dd>
          </div>
          {est.fees?.map((f, i) => (
            <div key={i} className="flex justify-between gap-3">
              <dt className="capitalize">{f.type} fee</dt>
              <dd className="tabular-nums" style={{ color: 'var(--ink)' }}>
                {f.amount ? formatDecimalString(f.amount, 6) : '--'} {f.token}
              </dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt>Network gas (USDC)</dt>
            <dd className="tabular-nums" style={{ color: 'var(--ink)' }}>
              {gasPrice !== undefined ? `${Number(formatGwei(gasPrice)).toLocaleString(undefined, { maximumFractionDigits: 2 })} gwei now` : 'Shown in your wallet'}
            </dd>
          </div>
        </dl>
      )}
      {est && <DynamicFeeNote />}
      <FailureNotice info={failure} onDismiss={() => setFailure(null)} />
      {current?.error && (
        <p className="flex items-start gap-2 text-xs" style={{ color: 'var(--amber)' }} role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Could not get a quote: {current.error}
        </p>
      )}

      {est && valid && (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)' }} aria-label="Cost preview">
          <p className="eyebrow mb-2">Cost preview</p>
          <dl className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: 'var(--muted)' }}>You pay</dt>
              <dd className="tabular-nums" style={{ color: 'var(--ink-2)' }}>
                {amount} {label(from)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: 'var(--muted)' }}>Network fee (USDC)</dt>
              <dd className="text-right text-xs" style={{ color: 'var(--ink-2)' }}>
                Set by your wallet at signing{gasPrice !== undefined ? `, gas price now ${Number(formatGwei(gasPrice)).toLocaleString(undefined, { maximumFractionDigits: 1 })} gwei` : ''}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-semibold" style={{ color: 'var(--ink)' }}>
                Total USDC deducted
              </dt>
              <dd className="text-right font-bold tabular-nums" style={{ color: '#ffffff' }}>
                {from === 'USDC' ? `${amount} USDC + network fee` : 'Network fee only'}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
            The swap transaction is built by the swap provider, so its exact gas is only known when your wallet prepares it. The wallet shows the final USDC fee before you confirm.
          </p>
          <div className="mt-2">
            <DynamicFeeNote />
          </div>
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Swaps are routed through a swap service provider (a third-party aggregator such as LiFi, or Circle) that can vary by route and change over time, and you are subject to its terms. This moves real funds on {NETWORK_NAME}: start with a small amount.
        {big && ' This amount is above 100 USDC, so double-check everything.'}
      </p>

      {!isConnected ? (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button onClick={show} className="cta min-h-12 w-full text-base font-semibold">
              Connect Wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      ) : !onArc ? (
        <button onClick={() => void switchChainAsync({ chainId: CHAIN_ID })} disabled={switching} className="cta min-h-12 w-full text-base font-semibold">
          {switching ? 'Switching...' : `Switch to ${NETWORK_NAME}`}
        </button>
      ) : (
        <button onClick={() => void swap()} disabled={!est || busy} className="cta min-h-12 w-full text-base font-semibold">
          {busy ? 'Confirm in your wallet...' : est ? `Swap ${amount} ${label(from)} to ${label(to)}` : 'Enter an amount'}
        </button>
      )}
    </section>
  )
}
