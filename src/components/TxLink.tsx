import { ExternalLink } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { shortHash } from '@/lib/format'
import { CHAIN_ID } from '@/lib/trustora'

interface Props {
  hash: string
  /** Show the whole hash (wrapped) instead of the short form. */
  full?: boolean
  className?: string
}

/** A transaction hash that opens the Arc block explorer in a new tab. */
export function TxLink({ hash, full = false, className = '' }: Props) {
  return (
    <a
      href={buildTxExplorerUrl(CHAIN_ID, hash)}
      target="_blank"
      rel="noopener noreferrer"
      title="View this transaction on the block explorer"
      className={`mono inline-flex items-center gap-1.5 rounded-md text-xs underline decoration-white/20 underline-offset-2 transition-colors duration-150 hover:decoration-indigo-300 hover:text-white ${full ? 'break-all' : ''} ${className}`}
      style={{ color: '#a9c6ff' }}
    >
      <span>{full ? hash : shortHash(hash)}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">(opens the block explorer)</span>
    </a>
  )
}
