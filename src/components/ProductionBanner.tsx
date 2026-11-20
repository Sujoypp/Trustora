import { useState } from 'react'
import { useAccount } from 'wagmi'
import { AlertTriangle, Check, ChevronDown, Info, Lock } from 'lucide-react'
import { Popover } from '@/components/Popover'
import { useContractStatus } from '@/lib/contractStatus'
import { CHAIN_ID, ROUTER_ADDRESS, USDC_ADDRESS, NETWORK_NAME } from '@/lib/trustora'
import { getUsdc } from '@/onchain-facts'

type Tone = 'ok' | 'warn' | 'info'

interface Check {
  label: string
  detail: string
  tone: Tone
}

/** Slim mainnet-only strip: self-custody note plus a live protocol readiness checklist. */
export function ProductionBanner() {
  const [open, setOpen] = useState(false)
  const { isConnected, chainId } = useAccount()
  const contract = useContractStatus()

  const registryUsdc = getUsdc(CHAIN_ID)?.address.toLowerCase()
  const checks: Check[] = [
    {
      label: 'Wallet on Arc Mainnet',
      detail: !isConnected ? 'Connect a wallet to check.' : chainId === CHAIN_ID ? `Connected to ${NETWORK_NAME}.` : 'Your wallet is on another network.',
      tone: !isConnected ? 'info' : chainId === CHAIN_ID ? 'ok' : 'warn',
    },
    {
      label: 'USDC address matches the registry',
      detail: registryUsdc === USDC_ADDRESS.toLowerCase() ? 'Uses the USDC address from the onchain facts registry.' : 'Does not match the registry. Do not send.',
      tone: registryUsdc === USDC_ADDRESS.toLowerCase() ? 'ok' : 'warn',
    },
    {
      label: 'Payment contract configured',
      detail: ROUTER_ADDRESS ? 'A mainnet contract address is set.' : 'No mainnet contract address set. Sending is off until you deploy and configure one.',
      tone: ROUTER_ADDRESS ? 'ok' : 'warn',
    },
    {
      label: 'Contract code found onchain',
      detail: !ROUTER_ADDRESS ? 'Waiting for a contract address.' : contract === 'checking' ? 'Checking...' : contract === 'missing' ? 'No code at that address on this network.' : 'Code found at the address.',
      tone: !ROUTER_ADDRESS || contract === 'checking' ? 'info' : contract === 'missing' ? 'warn' : 'ok',
    },
    {
      label: 'Source verified on the explorer',
      detail: contract === 'verified' ? 'The explorer reports verified source.' : 'Not confirmed. Verify the source before using real funds.',
      tone: contract === 'verified' ? 'ok' : 'warn',
    },
    { label: 'Independent audit', detail: 'None recorded. Get a professional audit before relying on this contract.', tone: 'info' },
  ]
  const passed = checks.filter((c) => c.tone === 'ok').length

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-3.5 py-3 text-xs sm:px-4"
      style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.06)' }}
      role="status"
    >
      <p className="flex min-w-0 items-center gap-2" style={{ color: 'var(--ink-2)' }}>
        <Lock className="size-3.5 shrink-0" style={{ color: 'var(--amber)' }} aria-hidden="true" />
        <span>
          <strong className="font-semibold">{NETWORK_NAME}: real funds.</strong> Self-custody: your wallet holds the keys and signs every payment, over an encrypted connection.
        </span>
      </p>
      <Popover
        open={open}
        onOpenChange={setOpen}
        width={340}
        rootClassName="static sm:relative"
        trigger={
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="ghost-btn flex min-h-8 items-center gap-1.5 rounded-full border px-3 font-semibold"
            style={{ borderColor: 'rgba(245,158,11,0.4)', color: 'var(--amber)' }}
          >
            Mainnet readiness {passed}/{checks.length - 1}
            <ChevronDown className={`size-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        }
      >
        <ul className="space-y-1 p-1">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2.5 rounded-lg px-2 py-2">
              {c.tone === 'ok' ? (
                <Check className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--emerald)' }} aria-hidden="true" />
              ) : c.tone === 'warn' ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--amber)' }} aria-hidden="true" />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />
              )}
              <span className="text-xs">
                <span className="block text-sm font-medium">{c.label}</span>
                <span style={{ color: 'var(--muted)' }}>{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  )
}
