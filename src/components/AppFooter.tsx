import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useContractStatus } from '@/lib/contractStatus'
import { shortAddress } from '@/lib/format'
import { NETWORK_NAME, ROUTER_ADDRESS } from '@/lib/trustora'

/** Minimal protocol footer: contract (tap to copy), network and custody status, ecosystem line and one safety notice. */
export function AppFooter() {
  const status = useContractStatus()
  const [copied, setCopied] = useState(false)
  const verified = status === 'verified'

  async function copy() {
    if (!ROUTER_ADDRESS) return
    try {
      await navigator.clipboard.writeText(ROUTER_ADDRESS)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy', { id: 'copy-failed', description: 'Select the address and copy it by hand.' })
    }
  }

  return (
    <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6">
        {ROUTER_ADDRESS ? (
          <button
            type="button"
            onClick={() => void copy()}
            title={`Copy ${ROUTER_ADDRESS}`}
            aria-label={`Copy contract address ${ROUTER_ADDRESS}`}
            className="group flex min-h-8 w-fit items-center gap-2 rounded-md text-left transition-colors duration-150 hover:text-white"
          >
            <span>{verified ? 'Verified Contract' : 'Contract'}</span>
            <code className="mono rounded px-1.5 py-0.5" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--ink)' }}>
              {shortAddress(ROUTER_ADDRESS)}
            </code>
            {copied ? <Check className="size-3.5" style={{ color: 'var(--emerald)' }} aria-hidden="true" /> : <Copy className="size-3.5 opacity-70 group-hover:opacity-100" aria-hidden="true" />}
            <span aria-live="polite" style={{ color: 'var(--emerald)' }}>
              {copied ? 'Copied!' : ''}
            </span>
          </button>
        ) : (
          <span>Contract: not configured yet</span>
        )}

        <p className="flex items-center gap-2">
          <span className="live-dot size-2 shrink-0 rounded-full" style={{ background: 'var(--emerald)' }} aria-hidden="true" />
          100% Non-Custodial • {NETWORK_NAME} • Circle USDC
        </p>
      </div>

      <p className="mt-3 max-w-3xl text-pretty text-[11px]" style={{ color: 'var(--subtle)' }}>
        Transactions on {NETWORK_NAME} use real funds and cannot be reversed. Trustora is a software interface, not a bank, exchange or custodian, and does not give financial advice.
      </p>
    </footer>
  )
}
