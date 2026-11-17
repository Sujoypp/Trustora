import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton, useModal } from 'connectkit'
import { Wallet } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { NetworkPill } from '@/components/NetworkPill'
import { SecurityBadge } from '@/components/SecurityBadge'
import { CHAIN_ID, NETWORK_NAME } from '@/lib/trustora'
import { shortAddress } from '@/lib/format'

/** Slim top bar: logo, network status, security panel and wallet pill. */
export function Header() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const { setOpen } = useModal()
  const wrongNetwork = isConnected && chainId !== CHAIN_ID

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-3 border-b px-4 sm:px-6"
      style={{ borderColor: 'var(--border)', background: 'rgba(3,5,9,0.96)' }}
    >
      <Logo />

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {wrongNetwork && (
          <button
            type="button"
            onClick={() => switchChain({ chainId: CHAIN_ID })}
            disabled={isPending}
            className="ghost-btn flex min-h-9 items-center gap-2 border px-3 text-xs font-medium"
            style={{ borderColor: 'rgba(245,158,11,0.5)', color: 'var(--amber)' }}
          >
            <span className="size-2 rounded-full" style={{ background: 'var(--amber)' }} />
            {isPending ? 'Switching...' : `Switch to ${NETWORK_NAME}`}
          </button>
        )}
        <NetworkPill />

        <SecurityBadge />

        {isConnected && address ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Wallet account"
            className="ghost-btn mono flex min-h-9 items-center gap-2 border px-3 text-xs font-medium"
            style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.03)' }}
          >
            <span className="size-2 rounded-full" style={{ background: 'var(--emerald)' }} />
            <span className="sm:hidden">{shortAddress(address, 4, 4)}</span>
            <span className="hidden sm:inline">{shortAddress(address)}</span>
          </button>
        ) : (
          <ConnectKitButton.Custom>
            {({ show, isConnecting }) => (
              <button onClick={show} className="cta flex min-h-9 items-center gap-2 px-3.5 text-xs font-semibold">
                <Wallet className="size-4" aria-hidden="true" />
                {isConnecting ? 'Connecting...' : 'Connect wallet'}
              </button>
            )}
          </ConnectKitButton.Custom>
        )}
      </div>
    </header>
  )
}
