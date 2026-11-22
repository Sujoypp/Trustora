import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, type LucideIcon } from 'lucide-react'

/** Shared loading, empty, error and success states so every screen speaks the same visual language. */
export function LoadingState({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="shimmer h-16 rounded-xl" style={{ opacity: 1 - i * 0.18 }} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-5 py-9 text-center" style={{ borderColor: 'var(--border)', background: 'rgba(8,15,34,0.35)' }}>
      <span className="flex size-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(79,140,255,0.12)', color: '#7aa9ff' }}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="display text-base font-semibold">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm" style={{ color: 'var(--muted)' }}>{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', description, onRetry }: { title?: string; description?: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border px-5 py-8 text-center" style={{ borderColor: 'rgba(251,113,133,0.3)', background: 'rgba(251,113,133,0.06)' }} role="alert">
      <span className="flex size-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(251,113,133,0.14)', color: 'var(--danger)' }}>
        <AlertTriangle className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="display text-base font-semibold">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm" style={{ color: 'var(--muted)' }}>{description}</p>}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="ghost-btn min-h-10 border px-5 text-sm font-semibold">
          Try again
        </button>
      )}
    </div>
  )
}

/** Animated success mark: the ring pops in and the tick draws itself. */
export function SuccessMark({ className = 'size-16' }: { className?: string }) {
  return (
    <span className={`success-ring flex items-center justify-center rounded-full ${className}`} style={{ background: 'rgba(52,211,153,0.14)', boxShadow: '0 0 0 1px rgba(52,211,153,0.35)' }} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="check-draw size-1/2" fill="none" stroke="#34d399" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}
