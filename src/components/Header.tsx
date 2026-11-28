import { Logo } from '@/components/Logo'
import { NetworkPill } from '@/components/NetworkPill'
import { NotificationBell } from '@/components/NotificationBell'
import { WalletMenu } from '@/components/WalletMenu'

/** Top bar: brand on the left, live network status and the wallet menu on the right. */
export function Header() {
  return (
    <header
      className="blur-surface fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-2 border-b px-3 sm:gap-3 sm:px-6"
      style={{ background: 'rgba(5, 7, 12, 0.9)', borderColor: 'rgba(255, 255, 255, 0.08)' }}
    >
      <Logo />
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <NetworkPill />
        <NotificationBell />
        <WalletMenu />
      </div>
    </header>
  )
}
