import type { ReactNode } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { goBack, navigate, useRoute } from '@/lib/router'
import { matchRoute, parentPath } from '@/lib/routes'

/** The universal glassmorphic back button used on every page, action screen and modal. */
export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="ghost-btn group glass-inner flex min-h-10 items-center gap-2 py-2 pl-3 pr-4 text-sm font-medium"
      style={{ color: 'var(--ink)' }}
    >
      <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
      {label}
    </button>
  )
}

export function Breadcrumbs() {
  const route = useRoute()
  const def = matchRoute(route.path)
  if (!def) return null
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs font-medium sm:text-sm">
        {def.crumbs.map((c, i) => {
          const last = i === def.crumbs.length - 1
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5" style={{ color: 'var(--subtle)' }} aria-hidden="true" />}
              {last || !c.to ? (
                <span aria-current={last ? 'page' : undefined} style={{ color: last ? 'var(--ink)' : 'var(--muted)' }}>
                  {c.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(c.to!, { dir: -1 })}
                  className="rounded-md px-1 py-0.5 transition-colors hover:bg-white/5 hover:text-white"
                  style={{ color: 'var(--muted)' }}
                >
                  {c.label}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

interface Props {
  actions?: ReactNode
  /** Overrides the title and subtitle from the route table. */
  title?: string
  subtitle?: string
}

/** Back button, breadcrumbs and title block shown at the top of every sub-view. */
export function PageHeader({ actions, title, subtitle }: Props) {
  const route = useRoute()
  const def = matchRoute(route.path)
  // Say "Dashboard" only when Back really lands there.
  const toDashboard = route.from === '/' || (route.idx === 0 && def !== undefined && parentPath(def) === '/')
  return (
    <>
      {/* Direct child of the page container so it stays pinned under the top bar while the page scrolls. */}
      <div className="sticky top-[60px] z-20 flex flex-wrap items-center gap-x-4 gap-y-3 py-2" style={{ background: 'var(--bg)' }}>
        <BackButton onClick={() => goBack(def ? parentPath(def) : '/')} label={toDashboard ? 'Back to Dashboard' : 'Back'} />
        <Breadcrumbs />
      </div>
      <div className="mb-6 mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-balance text-2xl font-semibold sm:text-[1.75rem]">{title ?? def?.title}</h1>
          <p className="mt-1 max-w-xl text-pretty text-sm" style={{ color: 'var(--muted)' }}>
            {subtitle ?? def?.subtitle}
          </p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </>
  )
}
