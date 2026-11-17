import { memo, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { prefetchRoute } from '@/lib/prefetch'
import { navigate } from '@/lib/router'

interface Props {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  to: string
  /** Live preview shown under the description (inline content only: the card is one button). */
  children?: ReactNode
  /** Accent color (hex) for the icon, hover border and glow. */
  color: string
  /** Position in the entrance stagger (fractions allowed). */
  order: number
}

/** One tool on the dashboard: icon, title, one-line subtitle and an arrow. */
export const FeatureCard = memo(function FeatureCard({ title, description, icon: Icon, to, color, order, children }: Props) {
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      onPointerEnter={() => prefetchRoute(to)}
      onFocus={() => prefetchRoute(to)}
      className="glass feature-card rise group flex h-full min-h-[200px] w-full flex-col justify-between p-6"
      style={{ '--i': order, '--c': color, '--duo': color === '#22d3ee' ? '#6366f1' : '#22d3ee' } as CSSProperties}
    >
      <span className="relative z-[1] flex w-full items-start justify-between">
        <span
          className="flex size-10 items-center justify-center rounded-lg border transition-transform duration-200 ease-out group-hover:scale-110"
          style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          <Icon className="size-6" />
        </span>
        <ArrowUpRight className="feature-arrow size-4" style={{ color: 'var(--subtle)' }} aria-hidden="true" />
      </span>
      <span className="relative z-[1] mt-5 block">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="mt-1 block text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          {description}
        </span>
        {children && (
          <span className="mt-4 block border-t pt-3 text-xs" style={{ borderColor: 'var(--border)' }}>
            {children}
          </span>
        )}
      </span>
    </button>
  )
})
