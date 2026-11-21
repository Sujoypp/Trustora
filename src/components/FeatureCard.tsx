import { memo, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { prefetchRoute } from '@/lib/prefetch'
import { navigate } from '@/lib/router'

interface Props {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  to: string
  /** Live preview shown under the description. Links and buttons in it stay clickable above the card's own link. */
  children?: ReactNode
  /** Accent color (hex) for the icon, hover border and glow. */
  color: string
  /** Position in the entrance stagger (fractions allowed). */
  order: number
  /** Extra layout classes, for example column spans. */
  className?: string
}

/** One tool on the dashboard: icon, title, one-line subtitle, an optional live preview and an arrow. */
export const FeatureCard = memo(function FeatureCard({ title, description, icon: Icon, to, color, order, children, className = '' }: Props) {
  return (
    <div
      className={`glass feature-card rise group relative flex h-full min-h-[200px] w-full flex-col justify-between p-6 ${className}`}
      style={{ '--i': order, '--c': color, '--duo': color === '#22d3ee' ? '#6366f1' : '#22d3ee' } as CSSProperties}
    >
      {/* The whole card opens the tool. Inner links and buttons sit above this layer. */}
      <button
        type="button"
        onClick={() => navigate(to)}
        onPointerEnter={() => prefetchRoute(to)}
        onFocus={() => prefetchRoute(to)}
        aria-label={`Open ${title}`}
        className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
      />
      <span className="pointer-events-none relative flex w-full items-start justify-between">
        <span
          className="flex size-10 items-center justify-center rounded-lg border transition-transform duration-200 ease-out group-hover:scale-110"
          style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          <Icon className="size-6" />
        </span>
        <ArrowUpRight className="feature-arrow size-4" style={{ color: 'var(--subtle)' }} aria-hidden="true" />
      </span>
      <div className="pointer-events-none relative mt-5">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="mt-1 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          {description}
        </p>
        {children && (
          <div
            className="mt-4 border-t pt-3 text-xs [&_a]:pointer-events-auto [&_a]:relative [&_a]:z-[2] [&_button]:pointer-events-auto [&_button]:relative [&_button]:z-[2]"
            style={{ borderColor: 'var(--border)' }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  )
})
