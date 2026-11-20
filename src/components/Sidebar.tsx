import { prefetchRoute } from '@/lib/prefetch'
import { ArrowLeftRight, FileCode2, History, LayoutGrid, Settings, ShieldCheck, type LucideIcon } from 'lucide-react'
import { navigate, useRoute } from '@/lib/router'
import { matchRoute, type NavId } from '@/lib/routes'

interface Item {
  id: NavId
  label: string
  to: string
  icon: LucideIcon
}

const ITEMS: Item[] = [
  { id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutGrid },
  { id: 'send', label: 'Send & Receive', to: '/send', icon: ArrowLeftRight },
  { id: 'contract', label: 'Smart Contract', to: '/contract', icon: FileCode2 },
  { id: 'history', label: 'Transaction History', to: '/history', icon: History },
  { id: 'vault', label: 'Security & Mainnet Status', to: '/vault', icon: ShieldCheck },
]

const SETTINGS: Item = { id: 'settings', label: 'Settings', to: '/settings', icon: Settings }

function NavButton({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => navigate(item.to)}
      onPointerEnter={() => prefetchRoute(item.to)}
      onFocus={() => prefetchRoute(item.to)}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className="group relative flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors md:size-10"
      style={{
        background: active ? 'rgba(99,102,241,0.16)' : undefined,
        color: active ? '#a5b4fc' : 'var(--muted)',
      }}
    >
      <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:block"
        style={{ background: '#1a1e2c', borderColor: 'var(--border)', color: 'var(--ink)' }}
      >
        {item.label}
      </span>
    </button>
  )
}

export function Sidebar() {
  const route = useRoute()
  const current = matchRoute(route.path)?.nav

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-between gap-1 overflow-x-auto border-t px-3 md:inset-x-auto md:bottom-0 md:left-0 md:top-[60px] md:h-auto md:w-[68px] md:flex-col md:overflow-visible md:border-r md:border-t-0 md:px-0 md:py-4"
      style={{ borderColor: 'var(--border)', background: 'rgba(3,5,9,0.98)' }}
    >
      <div className="flex flex-1 items-center justify-between gap-1 md:flex-none md:flex-col md:gap-1.5">
        {ITEMS.map((item) => (
          <NavButton key={item.id} item={item} active={current === item.id || (item.id === 'send' && current === 'receive')} />
        ))}
      </div>
      <div className="md:mt-auto">
        <NavButton item={SETTINGS} active={current === 'settings'} />
      </div>
    </nav>
  )
}
