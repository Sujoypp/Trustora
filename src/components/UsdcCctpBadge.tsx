import { BadgeCheck, CircleAlert, Loader2 } from 'lucide-react'
import { useCctpReadiness } from '@/lib/cctp'
import { useUsdcVerified } from '@/lib/usdcVerified'

/** "Native Arc Mainnet USDC (CCTP Ready)": the USDC contract checks out and Circle's CCTP contracts are live. */
export function UsdcCctpBadge() {
  const usdc = useUsdcVerified()
  const cctp = useCctpReadiness()
  const checking = usdc === 'checking' || cctp === 'checking'
  const ok = usdc === 'verified' && cctp === 'ready'
  const color = ok ? 'var(--emerald)' : checking ? 'var(--muted)' : 'var(--amber)'
  const Icon = ok ? BadgeCheck : checking ? Loader2 : CircleAlert
  const label = ok
    ? 'Native Arc Mainnet USDC (CCTP Ready)'
    : checking
      ? 'Verifying USDC and CCTP...'
      : usdc !== 'verified'
        ? 'USDC could not be verified'
        : 'CCTP is not available right now'

  return (
    <p
      className="mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
      style={{ color, borderColor: ok ? 'rgba(52,211,153,0.28)' : 'var(--border)', background: ok ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)' }}
      role="status"
    >
      <Icon className={`size-4 shrink-0 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
      {label}
    </p>
  )
}
