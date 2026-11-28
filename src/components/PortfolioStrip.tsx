import { memo, useEffect, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { ChevronDown, Layers, Link2, QrCode, Send, TrendingDown, TrendingUp } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ChainBreakdown } from '@/components/ChainBreakdown'
import { UsdcVerifiedBadge } from '@/components/UsdcVerifiedBadge'
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

  const { address } = useAccount()
  const [showChains, setShowChains] = useState(false)
  const ready = connected && balanceRaw !== undefined
  // Counts up or down when the balance changes (a deposit or a payment).
  const animated = balanceRaw ?? 0n
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
    <>
    <section className="glass gradient-border relative flex flex-col gap-6 overflow-hidden p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between" aria-label="Total balance">
      <svg className="pointer-events-none absolute -right-16 -top-24 size-80 opacity-60" viewBox="0 0 320 320" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="strip-arc" x1="0" y1="0" x2="320" y2="320" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4f8cff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="160" cy="160" r="150" stroke="url(#strip-arc)" strokeWidth="1" />
        <circle cx="160" cy="160" r="112" stroke="url(#strip-arc)" strokeWidth="1" strokeDasharray="3 7" />
        <circle cx="160" cy="160" r="74" stroke="url(#strip-arc)" strokeWidth="1" />
      </svg>
      <div className="relative min-w-0">
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
                  style={{ background: active ? 'rgba(79,140,255,0.25)' : 'transparent', color: active ? '#e4eeff' : 'var(--muted)' }}
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
          <p className="display mt-2 flex flex-wrap items-baseline gap-x-2 text-4xl font-bold tracking-tight sm:text-6xl">
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <UsdcVerifiedBadge />
          {connected && (
            <button
              type="button"
              onClick={() => setShowChains((v) => !v)}
              aria-expanded={showChains}
              aria-controls="chain-breakdown"
              className="ghost-btn flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold"
              style={{ borderColor: 'var(--border)', color: showChains ? '#9fe9f5' : 'var(--muted)' }}
            >
              <Layers className="size-3.5" aria-hidden="true" />
              USDC by chain
              <ChevronDown className={`size-3.5 transition-transform duration-200 ${showChains ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-2 lg:max-w-[24rem] lg:justify-end">
        <button type="button" onClick={() => navigate('/send')} onPointerEnter={() => prefetchRoute('/send')} className="cta flex min-h-12 items-center justify-center gap-2 px-6 text-base">
          <Send className="size-4" aria-hidden="true" />
          Send
        </button>
        {[
          { label: 'Receive', to: '/receive', icon: QrCode },
          { label: 'Payment Link', to: '/links', icon: Link2 },
        ].map(({ label, to, icon: Icon }) => (
          <button key={to} type="button" onClick={() => navigate(to)} onPointerEnter={() => prefetchRoute(to)} className="ghost-btn flex min-h-12 items-center justify-center gap-2 border px-4 text-sm font-semibold">
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
        {!connected && (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button type="button" onClick={show} className="ghost-btn min-h-12 border px-5 text-sm font-semibold" style={{ borderColor: 'rgba(34,211,238,0.45)', color: '#9fe9f5' }}>
                Connect Wallet
              </button>
            )}
          </ConnectKitButton.Custom>
        )}
      </div>
    </section>
    {connected && showChains && (
      <div id="chain-breakdown" className="mt-4">
        <ChainBreakdown owner={address} hideBalance={hideBalance} />
      </div>
    )}
    </>
  )
})
