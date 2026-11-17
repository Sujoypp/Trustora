import { ExternalLink, Lock, ShieldCheck } from 'lucide-react'
import { NetworkMetrics } from '@/components/NetworkPill'
import { CHAIN, CHAIN_ID, ROUTER_ADDRESS } from '@/lib/trustora'
import { buildAddressExplorerUrl } from '@/onchain-facts'

const link = 'inline-flex items-center gap-1 underline decoration-white/20 underline-offset-2 transition-colors duration-150 hover:text-white'

/** Footer: non-custodial security statement, live network numbers and plain-language notices. */
export function AppFooter() {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:'

  return (
    <footer className="mt-10 border-t pt-6 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--emerald)' }}>
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Non-custodial by design
            </p>
            <p className="mt-0.5 text-pretty">
              Trustora never holds your funds or your keys. Your wallet signs every transaction, and payments go straight from your wallet to the recipient.
            </p>
            <p className="mt-1.5 flex items-center gap-1.5" style={{ color: secure ? 'var(--emerald)' : 'var(--amber)' }}>
              <Lock className="size-3.5" aria-hidden="true" />
              {secure ? 'Connection encrypted (HTTPS)' : 'Connection is not encrypted'}
            </p>
          </div>
        </div>

        <div className="space-y-2 lg:text-right">
          <p className="eyebrow">Live network</p>
          <NetworkMetrics />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        <p className="max-w-2xl text-pretty" style={{ color: 'var(--subtle)' }}>
          Transactions on Arc Mainnet use real funds and cannot be reversed. Trustora is a software interface, not a bank, exchange or custodian, and does not give financial advice.
        </p>
        <nav aria-label="Footer links" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a href={CHAIN.explorerBase} target="_blank" rel="noopener noreferrer" className={link}>
            Block explorer
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
          {ROUTER_ADDRESS && (
            <a href={buildAddressExplorerUrl(CHAIN_ID, ROUTER_ADDRESS)} target="_blank" rel="noopener noreferrer" className={link}>
              Payment contract
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
          <a href="https://www.arc.io" target="_blank" rel="noopener noreferrer" className={link}>
            Arc
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </nav>
      </div>
    </footer>
  )
}
