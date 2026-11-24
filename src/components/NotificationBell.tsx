import { useState } from 'react'
import { ArrowDownLeft, Bell, BellRing, CalendarClock, FileText, Handshake } from 'lucide-react'
import { Popover } from '@/components/Popover'
import { useNotifications } from '@/hooks/useNotifications'
import { navigate } from '@/lib/router'
import { timeAgo } from '@/lib/format'
import type { AppNotification } from '@/lib/notifications'

const ICON = { payment: ArrowDownLeft, escrow: Handshake, invoice: FileText, schedule: CalendarClock } as const

function Row({ item, unread, onOpen }: { item: AppNotification; unread: boolean; onOpen: () => void }) {
  const Icon = ICON[item.kind]
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors duration-150 hover:bg-white/[0.05]">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: item.action ? 'rgba(245,181,68,0.14)' : 'rgba(79,140,255,0.14)', color: item.action ? 'var(--amber)' : '#7aa9ff' }}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{item.title}</span>
            {unread && <span className="size-1.5 shrink-0 rounded-full" style={{ background: 'var(--cyan)' }} aria-label="Unread" />}
          </span>
          <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>{item.detail}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: 'var(--subtle)' }}>
            {item.action && <span className="chip chip-warn !px-1.5 !py-0 text-[10px]">Action needed</span>}
            {item.at ? timeAgo(item.at) : ''}
          </span>
        </span>
      </button>
    </li>
  )
}

/** Header bell: payments you received, deals waiting on you, invoices, and scheduled payments that are due. */
export function NotificationBell() {
  const n = useNotifications()
  const [open, setOpen] = useState(false)
  const count = n.unread.length
  const shown = n.items.slice(0, 12)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width={360}
      placement="bottom-end"
      rootClassName="static sm:relative"
      trigger={
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'} className="ghost-btn relative flex size-10 shrink-0 items-center justify-center border">
          {count > 0 ? <BellRing className="size-[18px]" style={{ color: '#7aa9ff' }} aria-hidden="true" /> : <Bell className="size-[18px]" aria-hidden="true" />}
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4" style={{ background: 'var(--cyan)', color: '#04101f' }}>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      }
    >
      <div className="space-y-2 p-1">
        <div className="flex items-center justify-between px-2 pt-1">
          <p className="display text-sm font-semibold">Notifications</p>
          {count > 0 && (
            <button type="button" onClick={n.markAllRead} className="text-xs underline underline-offset-2" style={{ color: '#a9c6ff' }}>
              Mark all read
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
            You are all caught up. Payments you receive and actions waiting on you appear here.
          </p>
        ) : (
          <ul className="thin-scroll max-h-[55dvh] space-y-0.5 overflow-y-auto">
            {shown.map((item) => (
              <Row key={item.id} item={item} unread={!n.read.has(item.id)} onOpen={() => { n.markRead([item.id]); setOpen(false); navigate(item.to) }} />
            ))}
          </ul>
        )}
        <div className="border-t px-2 pt-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
          {n.permission === 'unsupported' ? (
            <p>This browser does not support desktop alerts.</p>
          ) : n.permission === 'denied' ? (
            <p>Desktop alerts are blocked in your browser settings.</p>
          ) : n.browserOn ? (
            <p className="flex items-center justify-between gap-2">
              <span>Desktop alerts are on while this tab is open.</span>
              <button type="button" onClick={n.disableBrowser} className="underline underline-offset-2" style={{ color: '#a9c6ff' }}>Turn off</button>
            </p>
          ) : (
            <p className="flex items-center justify-between gap-2">
              <span>Get a desktop alert when this tab is in the background.</span>
              <button type="button" onClick={() => void n.enableBrowser()} className="shrink-0 underline underline-offset-2" style={{ color: '#a9c6ff' }}>Turn on</button>
            </p>
          )}
          <p className="mt-1" style={{ color: 'var(--subtle)' }}>Alerts only work while TRUSTORA is open. Background push needs a server and is not included.</p>
        </div>
      </div>
    </Popover>
  )
}
