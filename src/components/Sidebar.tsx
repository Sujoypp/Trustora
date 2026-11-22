import { useEffect, useState } from 'react'
import { ArrowLeftRight, BadgeCheck, CalendarClock, FileCode2, FileText, Handshake, History, LayoutGrid, Link2, MoreHorizontal, Network, Repeat, Settings, ShieldCheck, Split, X, type LucideIcon } from 'lucide-react'
import { BrandMark } from '@/components/Logo'
import { prefetchRoute } from '@/lib/prefetch'
import { navigate, useRoute } from '@/lib/router'
import { matchRoute, type NavId } from '@/lib/routes'

interface Item {
  id: NavId
  label: string
  to: string
  icon: LucideIcon
}

const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'Overview', items: [{ id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutGrid }] },
  {
    title: 'Pay',
    items: [
      { id: 'send', label: 'Send & Receive', to: '/send', icon: ArrowLeftRight },
      { id: 'swap', label: 'Circle Swap', to: '/swap', icon: Repeat },
      { id: 'bridge', label: 'CCTP Bridge', to: '/bridge', icon: Network },
      { id: 'links', label: 'Payment Links', to: '/links', icon: Link2 },
      { id: 'split', label: 'Split Payments', to: '/split', icon: Split },
    ],
  },
  {
    title: 'Protect',
    items: [
      { id: 'escrow', label: 'Escrow & Agreements', to: '/escrow', icon: Handshake },
      { id: 'invoices', label: 'Smart Invoices', to: '/invoices', icon: FileText },
      { id: 'recurring', label: 'Recurring Payments', to: '/recurring', icon: CalendarClock },
    ],
  },
  {
    title: 'Records',
    items: [
      { id: 'history', label: 'Transaction History', to: '/history', icon: History },
      { id: 'proof', label: 'Onchain Proof', to: '/proof', icon: BadgeCheck },
      { id: 'contract', label: 'Smart Contract', to: '/contract', icon: FileCode2 },
      { id: 'vault', label: 'Trust Score & Status', to: '/vault', icon: ShieldCheck },
    ],
  },
]
const SETTINGS: Item = { id: 'settings', label: 'Settings', to: '/settings', icon: Settings }
const ALL = [...GROUPS.flatMap((g) => g.items), SETTINGS]
const TABS: Item[] = [ALL[0], ALL[1], GROUPS[2].items[0], GROUPS[3].items[0]]

const isActive = (current: NavId | undefined, item: Item) => current === item.id || (item.id === 'send' && current === 'receive')

function SideLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => navigate(item.to)}
      onPointerEnter={() => prefetchRoute(item.to)}
      onFocus={() => prefetchRoute(item.to)}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      className="group relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150 lg:px-3.5"
      style={{
        background: active ? 'linear-gradient(90deg, rgba(79,140,255,0.2), rgba(34,211,238,0.06))' : undefined,
        color: active ? '#ffffff' : 'var(--muted)',
      }}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full" style={{ background: 'linear-gradient(#4f8cff, #22d3ee)' }} aria-hidden="true" />}
      <Icon className="size-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110" style={{ color: active ? '#7aa9ff' : undefined }} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
      <span className="hidden truncate lg:block">{item.label}</span>
    </button>
  )
}

function TabButton({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => navigate(item.to)}
      onPointerEnter={() => prefetchRoute(item.to)}
      aria-current={active ? 'page' : undefined}
      className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition-colors duration-150 active:scale-95"
      style={{ color: active ? '#ffffff' : 'var(--muted)' }}
    >
      <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150" style={{ background: active ? 'rgba(79,140,255,0.22)' : undefined }}>
        <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
      </span>
      {item.label.split(' ')[0]}
    </button>
  )
}

export function Sidebar() {
  const route = useRoute()
  const current = matchRoute(route.path)?.nav
  const [more, setMore] = useState(false)
  const [lastPath, setLastPath] = useState(route.path)

  // Close the sheet whenever the screen changes (state derived during render, no effect needed).
  if (route.path !== lastPath) {
    setLastPath(route.path)
    setMore(false)
  }
  useEffect(() => {
    if (!more) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [more])

  const inTabs = TABS.some((t) => isActive(current, t))

  return (
    <>
      {/* Tablet and desktop: side rail (icons only on tablet, labeled on large screens) */}
      <nav
        aria-label="Main"
        className="thin-scroll fixed bottom-0 left-0 top-16 z-30 hidden w-[72px] flex-col gap-4 overflow-y-auto border-r px-2.5 py-4 md:flex lg:w-[248px] lg:px-3"
        style={{ borderColor: 'var(--border)', background: 'rgba(5, 10, 24, 0.7)' }}
      >
        {GROUPS.map((g) => (
          <div key={g.title} className="space-y-1">
            <p className="eyebrow hidden px-3.5 pb-1 lg:block">{g.title}</p>
            {g.items.map((item) => (
              <SideLink key={item.id} item={item} active={isActive(current, item)} />
            ))}
          </div>
        ))}
        <div className="mt-auto border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <SideLink item={SETTINGS} active={current === 'settings'} />
        </div>
      </nav>

      {/* Phone: five-tab bottom bar; More opens every screen in a sheet */}
      <nav aria-label="Main" className="blur-surface fixed inset-x-0 bottom-0 z-40 flex items-center gap-1 border-t px-2 pb-[env(safe-area-inset-bottom)] md:hidden" style={{ borderColor: 'var(--border)', background: 'rgba(5, 10, 24, 0.9)' }}>
        {TABS.map((t) => (
          <TabButton key={t.id} item={t} active={isActive(current, t)} />
        ))}
        <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition-colors duration-150 active:scale-95" style={{ color: !inTabs && !more ? '#ffffff' : 'var(--muted)' }}>
          <span className="flex h-7 w-12 items-center justify-center rounded-full" style={{ background: !inTabs ? 'rgba(79,140,255,0.22)' : undefined }}>
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </span>
          More
        </button>
      </nav>

      {more && (
        <div className="anim-enter fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="All screens">
          <button type="button" className="blur-surface absolute inset-0 cursor-default" style={{ background: 'rgba(2, 5, 14, 0.7)' }} onClick={() => setMore(false)} aria-label="Close menu" tabIndex={-1} />
          <div className="sheet-in glass absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-b-none p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" style={{ borderRadius: '24px 24px 0 0' }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="display flex items-center gap-2.5 text-lg font-semibold"><BrandMark className="size-8" animated={false} />All screens</h2>
              <button type="button" onClick={() => setMore(false)} aria-label="Close" className="ghost-btn flex size-10 items-center justify-center border">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4">
              {[...GROUPS.slice(1), { title: 'Account', items: [SETTINGS] }].map((g) => (
                <div key={g.title}>
                  <p className="eyebrow mb-2">{g.title}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {g.items.map((item) => {
                      const Icon = item.icon
                      const active = isActive(current, item)
                      return (
                        <button key={item.id} type="button" onClick={() => navigate(item.to)} aria-current={active ? 'page' : undefined} className="glass-inner flex min-h-[76px] flex-col items-center justify-center gap-1.5 px-1 text-center text-[11px] font-semibold leading-tight transition-transform duration-150 active:scale-95" style={{ borderColor: active ? 'var(--border-hot)' : undefined, color: active ? '#ffffff' : 'var(--ink-2)' }}>
                          <Icon className="size-5" style={{ color: active ? '#7aa9ff' : 'var(--muted)' }} aria-hidden="true" />
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
