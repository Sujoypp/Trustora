import { CircleAlert, Info, X } from 'lucide-react'
import type { ErrorInfo } from '@/lib/errors'

/** Inline result of a rejected or failed action: what happened and what to do next. */
export function FailureNotice({ info, onDismiss }: { info: ErrorInfo | null; onDismiss: () => void }) {
  if (!info) return null
  const cancelled = info.kind === 'rejected'
  const Icon = cancelled ? Info : CircleAlert
  const color = cancelled ? '#a9c6ff' : 'var(--amber)'
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border p-3 text-sm"
      style={{ borderColor: cancelled ? 'rgba(79,140,255,0.4)' : 'rgba(245,158,11,0.4)', background: cancelled ? 'rgba(79,140,255,0.08)' : 'rgba(245,158,11,0.07)' }}
    >
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold" style={{ color }}>
          {info.title}
        </p>
        <p className="mt-0.5 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
          {info.message}
        </p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="ghost-btn flex size-7 shrink-0 items-center justify-center rounded-md">
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
