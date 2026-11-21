import { BadgeCheck, CircleAlert, Loader2 } from 'lucide-react'
import { useCctpReadiness } from '@/lib/cctp'
import { CHAIN_ID, NETWORK_NAME } from '@/lib/trustora'
import { useUsdcVerified } from '@/lib/usdcVerified'

type Key = 'arc' | 'usdc' | 'cctp'

function Badge({ state, label, title }: { state: 'ok' | 'checking' | 'bad'; label: string; title: string }) {
  const color = state === 'ok' ? 'var(--emerald)' : state === 'checking' ? 'var(--muted)' : 'var(--amber)'
  const Icon = state === 'ok' ? BadgeCheck : state === 'checking' ? Loader2 : CircleAlert
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ color, borderColor: 'var(--border)' }} title={title}>
      <Icon className={`size-3.5 ${state === 'checking' ? 'animate-spin' : ''}`} aria-hidden="true" />
      {label}
    </span>
  )
}

/** Small, accurate ecosystem notes: where it runs, which USDC it uses, and whether CCTP is live. Each reflects a live check. */
export function EcosystemBadges({ show = ['arc', 'usdc', 'cctp'] }: { show?: Key[] }) {
  const usdc = useUsdcVerified()
  const cctp = useCctpReadiness()
  return (
    <div className="flex flex-wrap gap-2" aria-label="Ecosystem status">
      {show.includes('arc') && <Badge state="ok" label={`Executes on ${NETWORK_NAME}`} title={`Transactions run on ${NETWORK_NAME} (chain ${CHAIN_ID}).`} />}
      {show.includes('usdc') && (
        <Badge
          state={usdc === 'verified' ? 'ok' : usdc === 'checking' ? 'checking' : 'bad'}
          label="Circle USDC, 6 decimals"
          title="The USDC contract matches the address Circle publishes for Arc and reports the symbol USDC with 6 decimals."
        />
      )}
      {show.includes('cctp') && (
        <Badge
          state={cctp === 'ready' ? 'ok' : cctp === 'checking' ? 'checking' : 'bad'}
          label={cctp === 'ready' ? 'CCTP cross-chain ready' : cctp === 'checking' ? 'Checking CCTP' : 'CCTP unavailable'}
          title="Circle's Cross-Chain Transfer Protocol contracts both have code on Arc Mainnet, so USDC can be burned and minted across chains."
        />
      )}
    </div>
  )
}
