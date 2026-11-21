import { Info } from 'lucide-react'
import { NETWORK_NAME } from '@/lib/trustora'

/** One-line explanation shown wherever a fee estimate appears. */
export function DynamicFeeNote({ nonUsdcGas = false }: { nonUsdcGas?: boolean }) {
  return (
    <p className="flex items-start gap-2 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Estimates only. Fees on {NETWORK_NAME} are paid in USDC and are dynamic: they can change from block to block, so they are not a fixed price.
        {nonUsdcGas && ' Gas on other chains is paid in that chain’s own token.'}
      </span>
    </p>
  )
}
