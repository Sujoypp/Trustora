import { BadgeCheck, CircleAlert, Loader2 } from 'lucide-react'
import { useUsdcVerified } from '@/lib/usdcVerified'
import { NETWORK_NAME, USDC_ADDRESS } from '@/lib/trustora'

/** "Circle USDC Verified": the USDC contract matches Circle's published Arc address and reports USDC with 6 decimals. */
export function UsdcVerifiedBadge() {
  const state = useUsdcVerified()
  const ok = state === 'verified'
  const color = ok ? 'var(--emerald)' : state === 'checking' ? 'var(--muted)' : 'var(--amber)'
  const Icon = ok ? BadgeCheck : state === 'checking' ? Loader2 : CircleAlert

  return (
    <span
      className="flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium"
      style={{ color, borderColor: ok ? 'rgba(16,185,129,0.4)' : 'var(--border)' }}
      title={`USDC at ${USDC_ADDRESS} on ${NETWORK_NAME}: ${ok ? 'matches the address Circle publishes and reports USDC with 6 decimals.' : state === 'checking' ? 'checking.' : 'did not match the expected symbol or decimals.'}`}
    >
      <Icon className={`size-4 ${state === 'checking' ? 'animate-spin' : ''}`} aria-hidden="true" />
      {ok ? 'Circle USDC Native' : state === 'checking' ? 'Checking USDC...' : 'USDC unverified'}
    </span>
  )
}
