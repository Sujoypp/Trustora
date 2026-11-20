import { memo, useEffect, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { BadgeCheck, TrendingDown, TrendingUp } from 'lucide-react'
import { NetworkPill } from '@/components/NetworkPill'
import { useCountUp } from '@/hooks/useCountUp'
import { CURRENCIES, symbolOf, toFiat, useCurrency, useFxRates } from '@/lib/fiat'
import { formatUsdc, shortAddress } from '@/lib/format'
import { MASK } from '@/lib/prefs'
import { type Payment, NETWORK_NAME } from '@/lib/trustora'
import type { TrustScore } from '@/lib/trustScore'

interface Props {
  connected: boolean
  balanceRaw?: bigint
  loading: boolean
  hideBalance: boolean
  payments: Payment[]
  trustEnabled: boolean
  trust: TrustScore | null
}

/** Net USDC moved through Trustora in the last 24 hours (received minus sent). */
/** Wallet connection status for the hero: connected address, or a prompt to connect. */
function WalletChip() {
  const { address, isConnected } = useAccount()
  return (
    <span
      className="flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium"
      style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}
    >
      <span className="size-2 rounded-full" style={{ background: isConnected ? 'var(--emerald)' : 'var(--subtle)' }} />
      {isConnected && address ? (
        <>
          Connected <span className="mono">{shortAddress(address, 4, 4)}</span>
        </>
      ) : (
        'Wallet not connected'
      )}
    </span>
  )
}

function netLastDay(payments: Payment[], now: number): bigint {
  let net = 0n
  for (const p of payments) {
    if (p.direction === 'self' || p.timestamp < now - 86_400) continue
    net += p.direction === 'received' ? p.amountRaw : -p.amountRaw
  }
  return net
}

export const PortfolioStrip = memo(function PortfolioStrip({ connected, balanceRaw, loading, hideBalance, payments, trustEnabled, trust }: Props) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000)
    return () => clearInterval(t)
  }, [])

  const ready = connected && balanceRaw !== undefined
  // Counts up or down when the balance changes (a deposit or a payment).
  const animated = useCountUp(balanceRaw ?? 0n)
  const [chosen, setCurrency] = useCurrency()
  const fx = useFxRates()
  // Show USD until a rate is loaded; never guess one.
  const currency = chosen !== 'USD' && !fx.rates ? 'USD' : chosen
  const sym = symbolOf(currency)
  const fiat = (raw: bigint) => formatUsdc(toFiat(raw, currency, fx.rates))
  const net = netLastDay(payments, now)
  const prior = ready ? balanceRaw - net : 0n
  const pct = ready && net !== 0n && prior > 0n ? (Number(net) / Number(prior)) * 100 : null
  const up = net >= 0n
  const verified = trust !== null && trust.score >= 70

  return (
    <section className="glass flex flex-col gap-5 p-5 sm:gap-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between" aria-label="Portfolio">
      <div className="min-w-0">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <NetworkPill />
          <WalletChip />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="eyebrow">Total balance</p>
          <div role="radiogroup" aria-label="Display currency" className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border)' }}>
            {CURRENCIES.map((c) => {
              const active = currency === c.code
              const unavailable = c.code !== 'USD' && !fx.rates
              return (
                <button
                  key={c.code}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={unavailable}
                  onClick={() => setCurrency(c.code)}
                  title={unavailable ? (fx.failed ? 'Exchange rates could not be loaded' : 'Loading exchange rates') : undefined}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: active ? 'rgba(99,102,241,0.25)' : 'transparent', color: active ? '#c7d2fe' : 'var(--muted)' }}
                >
                  {c.symbol} {c.code}
                </button>
              )
            })}
          </div>
        </div>
        {connected && (loading || balanceRaw === undefined) ? (
          <span className="shimmer mt-3 block h-11 w-56 rounded-lg" />
        ) : (
          <p className="display mt-2 flex flex-wrap items-baseline gap-x-2 text-4xl font-semibold sm:text-[2.75rem]">
            <span>{sym}{ready ? (hideBalance ? MASK : fiat(animated)) : '0.00'}</span>
            <span className="text-base font-medium" style={{ color: 'var(--muted)' }}>
              {currency}
            </span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" style={{ color: 'var(--muted)' }}>
          <span>
            {ready ? (hideBalance ? MASK : formatUsdc(animated)) : '0.00'} USDC
            <span className="mx-2" style={{ color: 'var(--subtle)' }} aria-hidden="true">
              •
            </span>
            {NETWORK_NAME}
            {currency !== 'USD' && fx.rates && (
              <span style={{ color: 'var(--subtle)' }}>
                {' '}
                • 1 USD = {fx.rates[currency].toFixed(4)} {currency} (ECB {fx.rates.date})
              </span>
            )}
          </span>
          {ready && (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
              style={
                net === 0n
                  ? { background: 'rgba(255,255,255,0.05)', color: 'var(--muted)' }
                  : { background: up ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)', color: up ? 'var(--emerald)' : 'var(--danger)' }
              }
            >
              {net !== 0n && (up ? <TrendingUp className="size-3.5" aria-hidden="true" /> : <TrendingDown className="size-3.5" aria-hidden="true" />)}
              {net === 0n
                ? 'No change today'
                : hideBalance
                  ? 'Changed today'
                  : pct !== null
                    ? `${up ? '+' : ''}${pct.toFixed(1)}% today`
                    : `${up ? '+' : '-'}${sym}${fiat(up ? net : -net)} today`}
            </span>
          )}
        </div>
        {!connected && (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button onClick={show} className="cta mt-5 min-h-10 px-5 text-sm font-semibold">
                Connect wallet
              </button>
            )}
          </ConnectKitButton.Custom>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
      <div
        className="flex shrink-0 items-center gap-4 rounded-xl border p-4 sm:min-w-[260px]"
        style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}
        title={trust ? trust.factors.map((f) => `${f.label}: ${f.points}/${f.max}`).join('\n') : undefined}
      >
        <span
          className="flex size-11 items-center justify-center rounded-lg"
          style={{ background: verified ? 'rgba(16,185,129,0.14)' : 'rgba(99,102,241,0.14)', color: verified ? 'var(--emerald)' : '#a5b4fc' }}
        >
          <BadgeCheck className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="eyebrow">Arc Trust Score</p>
          {trustEnabled && trust === null ? (
            <span className="shimmer mt-2 block h-6 w-28 rounded-md" />
          ) : (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="display text-2xl font-semibold">{trust ? trust.score : '--'}</span>
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                / 100
              </span>
              {trust && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                  style={{ background: verified ? 'rgba(16,185,129,0.14)' : 'rgba(99,102,241,0.14)', color: verified ? 'var(--emerald)' : '#a5b4fc' }}
                >
                  {verified ? `Verified · ${trust.tier}` : trust.tier}
                </span>
              )}
            </p>
          )}
          {!trustEnabled && (
            <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
              Connect to see your score
            </p>
          )}
        </div>
      </div>
      </div>
    </section>
  )
})
