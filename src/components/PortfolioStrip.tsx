import { memo, useEffect, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { Send, TrendingDown, TrendingUp } from 'lucide-react'
import { UsdcVerifiedBadge } from '@/components/UsdcVerifiedBadge'
import { useCountUp } from '@/hooks/useCountUp'
import { CURRENCIES, symbolOf, toFiat, useCurrency, useFxRates } from '@/lib/fiat'
import { formatUsdc } from '@/lib/format'
import { MASK } from '@/lib/prefs'
import { prefetchRoute } from '@/lib/prefetch'
import { navigate } from '@/lib/router'
import { type Payment, NETWORK_NAME } from '@/lib/trustora'

interface Props {
  connected: boolean
  balanceRaw?: bigint
  loading: boolean
  hideBalance: boolean
  payments: Payment[]
}

/** Net USDC moved through Trustora in the last 24 hours (received minus sent). */
function netLastDay(payments: Payment[], now: number): bigint {
  let net = 0n
  for (const p of payments) {
    if (p.direction === 'self' || p.timestamp < now - 86_400) continue
    net += p.direction === 'received' ? p.amountRaw : -p.amountRaw
  }
  return net
}

/** Hero: the total balance, a currency switcher and a Quick Send button. */
export const PortfolioStrip = memo(function PortfolioStrip({ connected, balanceRaw, loading, hideBalance, payments }: Props) {
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

  return (
    <section className="glass flex flex-col gap-5 p-5 sm:gap-6 sm:p-7 lg:flex-row lg:items-end lg:justify-between" aria-label="Total balance">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="eyebrow">Total Trustora balance</p>
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
                  style={{ background: active ? 'rgba(99,102,241,0.25)' : 'transparent', color: active ? '#e0e7ff' : 'var(--muted)' }}
                >
                  {c.symbol} {c.code}
                </button>
              )
            })}
          </div>
        </div>

        {connected && (loading || balanceRaw === undefined) ? (
          <span className="shimmer mt-3 block h-12 w-56 rounded-lg" />
        ) : (
          <p className="display mt-2 flex flex-wrap items-baseline gap-x-2 text-4xl font-bold sm:text-5xl">
            <span>
              {sym}
              {ready ? (hideBalance ? MASK : fiat(animated)) : '0.00'}
            </span>
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
        <div className="mt-4">
          <UsdcVerifiedBadge />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col lg:items-stretch">
        <button
          type="button"
          onClick={() => navigate('/send')}
          onPointerEnter={() => prefetchRoute('/send')}
          className="cta flex min-h-12 items-center justify-center gap-2 px-7 text-base font-semibold"
        >
          <Send className="size-4" aria-hidden="true" />
          Quick Send
        </button>
        {!connected && (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button onClick={show} className="ghost-btn min-h-12 border px-6 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
                Connect Wallet
              </button>
            )}
          </ConnectKitButton.Custom>
        )}
      </div>
    </section>
  )
})
