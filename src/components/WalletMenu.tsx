import { useState } from 'react'
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi'
import { ConnectKitButton, useModal } from 'connectkit'
import { Check, ChevronDown, Copy, ExternalLink, LogOut, Repeat, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Popover } from '@/components/Popover'
import { useApp } from '@/lib/appContext'
import { formatUsdc, shortAddress } from '@/lib/format'
import { CHAIN_ID, NETWORK_NAME } from '@/lib/trustora'
import { buildAddressExplorerUrl } from '@/onchain-facts'

/** Deterministic two-tone avatar so each wallet is recognizable without any image. */
function Avatar({ address }: { address: string }) {
  const a = parseInt(address.slice(2, 5), 16) % 360
  return <span className="size-5 shrink-0 rounded-full" style={{ background: `conic-gradient(from 90deg, hsl(${a} 80% 62%), hsl(${(a + 70) % 360} 80% 58%), hsl(${a} 80% 62%))` }} aria-hidden="true" />
}

/** Wallet connection and network status: connect, see the account, confirm the network, switch wallet or disconnect. */
export function WalletMenu() {
  const { address, isConnected, chainId } = useAccount()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending } = useSwitchChain()
  const { setOpen: openConnect } = useModal()
  const app = useApp()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!isConnected || !address) {
    return (
      <ConnectKitButton.Custom>
        {({ show, isConnecting }) => (
          <button type="button" onClick={show} className="cta cta-pill flex min-h-10 shrink-0 items-center gap-2 px-4 text-sm">
            <Wallet className="size-4" aria-hidden="true" />
            {isConnecting ? 'Connecting...' : (<>Connect<span className="hidden sm:inline"> Wallet</span></>)}
          </button>
        )}
      </ConnectKitButton.Custom>
    )
  }

  const wrong = chainId !== CHAIN_ID
  async function copy() {
    try {
      await navigator.clipboard.writeText(address as string)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy', { id: 'copy-failed', description: 'Select the address and copy it by hand.' })
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width={300}
      placement="bottom-end"
      rootClassName="static sm:relative"
      trigger={
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Wallet menu"
          className="ghost-btn pill mono flex min-h-10 shrink-0 items-center gap-2 border px-2.5 text-xs font-medium sm:px-3"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <Avatar address={address} />
          <span className="sm:hidden">{shortAddress(address, 4, 4)}</span>
          <span className="hidden sm:inline">{shortAddress(address)}</span>
          {wrong ? <span className="size-2 rounded-full" style={{ background: 'var(--amber)' }} aria-label="Wrong network" /> : <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />}
        </button>
      }
    >
      <div className="space-y-3 p-2" role="menu">
        <div className="flex items-center gap-3">
          <Avatar address={address} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Connected wallet</p>
            <p className="mono truncate text-xs">{address}</p>
          </div>
          <button type="button" onClick={() => void copy()} aria-label="Copy address" className="ghost-btn flex size-9 shrink-0 items-center justify-center border">
            {copied ? <Check className="size-4" style={{ color: 'var(--emerald)' }} aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          </button>
        </div>

        <div className="glass-inner flex items-center justify-between px-3 py-2.5">
          <span className="eyebrow">USDC balance</span>
          <span className="display text-sm font-semibold tabular-nums">{app.balance ? formatUsdc(app.balance.raw) : '...'}</span>
        </div>

        <div className="glass-inner space-y-2 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Network</span>
            <span className={`chip ${wrong ? 'chip-warn' : 'chip-ok'}`}>
              <span className="size-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
              {wrong ? 'Wrong network' : `${NETWORK_NAME} · ${CHAIN_ID}`}
            </span>
          </div>
          {wrong && (
            <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} disabled={isPending} className="cta min-h-10 w-full text-sm">
              {isPending ? 'Switching...' : `Switch to ${NETWORK_NAME}`}
            </button>
          )}
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>TRUSTORA runs on {NETWORK_NAME} only.</p>
        </div>

        <div className="grid gap-1">
          <a href={buildAddressExplorerUrl(CHAIN_ID, address)} target="_blank" rel="noopener noreferrer" className="ghost-btn flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm" style={{ color: 'var(--ink-2)' }}>
            <ExternalLink className="size-4" aria-hidden="true" /> View on explorer
          </a>
          <button type="button" onClick={() => { setOpen(false); openConnect(true) }} className="ghost-btn flex min-h-10 items-center gap-2 rounded-lg px-3 text-left text-sm" style={{ color: 'var(--ink-2)' }}>
            <Repeat className="size-4" aria-hidden="true" /> Switch wallet
          </button>
          <button type="button" onClick={() => { setOpen(false); disconnect() }} className="ghost-btn flex min-h-10 items-center gap-2 rounded-lg px-3 text-left text-sm" style={{ color: 'var(--danger)' }}>
            <LogOut className="size-4" aria-hidden="true" /> Disconnect
          </button>
        </div>
      </div>
    </Popover>
  )
}
