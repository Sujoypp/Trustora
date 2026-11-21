import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { shortAddress } from '@/lib/format'

interface Props {
  address: string
  /** Show 0x2cfE...6dDa instead of the full address. */
  short?: boolean
}

/** Monospace address badge with a one-click copy button and a "Copied!" confirmation. */
export function AddressBadge({ address, short = false }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy', { id: 'copy-failed', description: 'Select the address and copy it by hand.' })
    }
  }

  return (
    <span
      className="inline-flex max-w-full flex-col overflow-hidden rounded-lg border sm:flex-row sm:items-stretch"
      style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.04)' }}
    >
      <code className="mono min-w-0 break-all px-3 py-2 text-xs sm:text-[13px]" style={{ color: 'var(--ink)' }}>
        {short ? shortAddress(address) : address}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Address copied' : 'Copy address'}
        className="ghost-btn flex shrink-0 items-center justify-center gap-1.5 border-t px-3 py-2 text-xs font-semibold sm:border-l sm:border-t-0"
        style={{ borderColor: 'var(--border)', color: copied ? 'var(--emerald)' : '#a5b4fc' }}
      >
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        <span aria-live="polite">{copied ? 'Copied!' : 'Copy Address'}</span>
      </button>
    </span>
  )
}
