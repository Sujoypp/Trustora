import { Logo } from '@/components/Logo'
import { NetworkPill } from '@/components/NetworkPill'
import { WalletMenu } from '@/components/WalletMenu'

/** Top bar: brand on the left, live network status and the wallet menu on the right. */
export function Header() {
  return (
    <header
      className="blur-surface fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-2 border-b px-3 sm:gap-3 sm:px-6"
      style={{ background: 'rgba(5, 10, 24, 0.82)', borderColor: 'var(--border)' }}
    >
      <Logo />
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <NetworkPill />
        <WalletMenu />
      </div>
    </header>
  )
}
