import type { ReactNode } from 'react'

export function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="glass rounded-xl p-5 sm:p-6">
      <h2 className="eyebrow mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

export function Toggle({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: ReactNode
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5" style={{ color: 'var(--accent)' }}>
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {hint}
          </p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? '#6366f1' : 'rgba(99,102,241,0.18)' }}
      >
        <span
          className="absolute left-0.5 top-0.5 size-6 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  )
}
