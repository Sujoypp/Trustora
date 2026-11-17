import { Hash, Search, X } from 'lucide-react'
import type { PaymentFilterState } from '@/hooks/usePaymentFilters'
import { activeFilterCount, type PaymentFilters } from '@/lib/paymentFilters'

interface Props {
  state: PaymentFilterState
  tags: { tag: string; count: number }[]
  total: number
  shown: number
  /** Also offer a Sent / Received filter (used on the full history page). */
  showDirection?: boolean
}

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        {label}
      </span>
      <div className="glass-inner flex rounded-full p-0.5" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const active = value === o.id
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.id)}
              className="min-h-8 rounded-full px-3 text-xs font-semibold transition-all"
              style={{
                background: active ? 'rgba(99,102,241,0.3)' : 'transparent',
                color: active ? '#fff' : 'var(--muted)',
                }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Search box plus status, token type and memo tag filters for a list of payments. */
export function PaymentFilterBar({ state, tags, total, shown, showDirection = false }: Props) {
  const { filters, patch, reset } = state
  const active = activeFilterCount(filters)

  return (
    <div className="mb-4 space-y-3">
      <div className="glass-inner flex items-center gap-2 rounded-full px-4">
        <Search className="size-4 shrink-0" style={{ color: 'var(--accent)' }} />
        <input
          value={filters.query}
          onChange={(e) => patch({ query: e.target.value })}
          placeholder="Search memo, address or hash"
          aria-label="Search payments"
          spellCheck={false}
          className="min-h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-600"
        />
        {filters.query && (
          <button
            onClick={() => patch({ query: '' })}
            aria-label="Clear search"
            className="flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
            style={{ color: 'var(--muted)' }}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Segment<PaymentFilters['status']>
          label="Status"
          value={filters.status}
          onChange={(status) => patch({ status })}
          options={[
            { id: 'all', label: 'All' },
            { id: 'confirmed', label: 'Confirmed' },
            { id: 'pending', label: 'Pending' },
          ]}
        />
        <Segment<PaymentFilters['route']>
          label="Token"
          value={filters.route}
          onChange={(route) => patch({ route })}
          options={[
            { id: 'all', label: 'Any' },
            { id: 'native', label: 'Native USDC' },
            { id: 'erc20', label: 'USDC (ERC-20)' },
          ]}
        />
        {showDirection && (
          <Segment<PaymentFilters['direction']>
            label="Type"
            value={filters.direction}
            onChange={(direction) => patch({ direction })}
            options={[
              { id: 'all', label: 'All' },
              { id: 'sent', label: 'Sent' },
              { id: 'received', label: 'Received' },
            ]}
          />
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Memo tags">
          <Hash className="size-4" style={{ color: 'var(--subtle)' }} />
          {tags.map(({ tag, count }) => {
            const on = filters.tag === tag
            return (
              <button
                key={tag}
                aria-pressed={on}
                onClick={() => patch({ tag: on ? null : tag })}
                className="min-h-8 rounded-full border px-3 text-xs font-semibold tabular-nums transition-all hover:scale-[1.03]"
                style={{
                  borderColor: on ? 'rgba(244,114,182,0.7)' : 'var(--border)',
                  background: on ? 'rgba(244,114,182,0.16)' : 'transparent',
                  color: on ? '#f9a8d4' : 'var(--ink-2)',
                }}
              >
                {tag} <span style={{ color: 'var(--subtle)' }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {active > 0 && (
        <p className="flex items-center justify-between text-xs tabular-nums" style={{ color: 'var(--muted)' }} aria-live="polite">
          Showing {shown} of {total}
          <button onClick={reset} className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--accent)' }}>
            Clear filters
          </button>
        </p>
      )}
    </div>
  )
}
