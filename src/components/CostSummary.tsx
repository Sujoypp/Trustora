import { DynamicFeeNote } from '@/components/DynamicFeeNote'
import { formatFeeUsdc, formatUsdc } from '@/lib/format'

interface Row {
  label: string
  value: string
  strong?: boolean
}

/**
 * What a payment will cost before the wallet asks you to sign: the amount, the network fee in USDC and the total USDC that leaves
 * the wallet. Arc's gas token is USDC, so the fee comes out of the same balance as the payment. Fees are dynamic, so it says so.
 */
export function CostSummary({
  amountRaw,
  feeUsdc,
  feeLoading,
  approval = false,
}: {
  amountRaw: bigint | null
  feeUsdc?: bigint
  feeLoading?: boolean
  /** The first payment with this token needs a one-time allowance, so the fee shown is the allowance fee. */
  approval?: boolean
}) {
  if (amountRaw === null) return null
  const rows: Row[] = [{ label: 'Amount', value: `${formatUsdc(amountRaw, 2)} USDC` }]
  if (feeLoading) rows.push({ label: approval ? 'Allowance fee (estimated)' : 'Network fee (estimated)', value: '...' })
  else if (feeUsdc !== undefined) rows.push({ label: approval ? 'Allowance fee (estimated)' : 'Network fee (estimated)', value: `~${formatFeeUsdc(feeUsdc)} USDC` })
  else rows.push({ label: 'Network fee (estimated)', value: 'Not available yet' })
  const total = feeUsdc !== undefined && !feeLoading ? amountRaw + feeUsdc : null
  rows.push({ label: approval ? 'Total deducted now' : 'Total deducted', value: total !== null ? `~${formatUsdc(total, 4)} USDC` : `${formatUsdc(amountRaw, 2)} USDC + fee`, strong: true })

  return (
    <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)' }} aria-label="Cost preview">
      <p className="eyebrow mb-2">Cost preview</p>
      <dl className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <dt style={{ color: r.strong ? 'var(--ink)' : 'var(--muted)' }} className={r.strong ? 'font-semibold' : ''}>
              {r.label}
            </dt>
            <dd className={`tabular-nums ${r.strong ? 'font-bold' : ''}`} style={{ color: r.strong ? '#ffffff' : 'var(--ink-2)' }}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      {approval && (
        <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
          The payment itself costs a second fee, shown once the allowance is in place.
        </p>
      )}
      <div className="mt-2">
        <DynamicFeeNote />
      </div>
    </div>
  )
}
