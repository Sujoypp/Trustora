import { useState, useSyncExternalStore } from 'react'
import { useAccount, useAccountEffect } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Loader2, PlugZap, RefreshCw, WifiOff, X } from 'lucide-react'
import { probeNetworkNow, useNetworkStatus } from '@/lib/networkReading'
import { NETWORK_NAME } from '@/lib/trustora'

const subscribeOnline = (notify: () => void) => {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)

function Notice({ tone, icon, title, detail, children }: { tone: 'warn' | 'info'; icon: React.ReactNode; title: string; detail: string; children?: React.ReactNode }) {
  const warn = tone === 'warn'
  return (
    <div
      role={warn ? 'alert' : 'status'}
      className="rise flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-3 text-sm"
      style={{ borderColor: warn ? 'rgba(245,158,11,0.4)' : 'rgba(34,211,238,0.35)', background: warn ? 'rgba(245,158,11,0.07)' : 'rgba(34,211,238,0.06)' }}
    >
      <span className="shrink-0" style={{ color: warn ? 'var(--amber)' : 'var(--cyan)' }} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold" style={{ color: warn ? 'var(--amber)' : 'var(--cyan)' }}>
          {title}
        </p>
        <p className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
          {detail}
        </p>
      </div>
      {children}
    </div>
  )
}

/**
 * Shows up only when something is wrong: the browser is offline, the Arc Mainnet node stopped answering,
 * the wallet is reconnecting, or the wallet disconnected mid-session. Otherwise it renders nothing.
 */
export function ConnectionStatus() {
  const online = useOnline()
  const rpc = useNetworkStatus()
  const { status } = useAccount()
  const [lost, setLost] = useState(false)
  useAccountEffect({
    onConnect: () => setLost(false),
    onDisconnect: () => setLost(true),
  })

  const reconnecting = status === 'reconnecting'
  if (online && rpc !== 'down' && !reconnecting && !lost) return null

  return (
    <div className="mb-4 grid gap-2" aria-live="polite">
      {!online && <Notice tone="warn" icon={<WifiOff className="size-5" />} title="You are offline" detail="Balances and history may be out of date. Everything resumes when your connection returns." />}
      {online && rpc === 'down' && (
        <Notice tone="warn" icon={<RefreshCw className="size-5" />} title={`${NETWORK_NAME} is not responding`} detail="The network node did not answer. Balances may be out of date. The app keeps retrying every few seconds, and your funds are not affected.">
          <button type="button" onClick={probeNetworkNow} className="ghost-btn min-h-9 border px-3 text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
            Retry now
          </button>
        </Notice>
      )}
      {reconnecting && <Notice tone="info" icon={<Loader2 className="size-5 animate-spin" />} title="Reconnecting to your wallet" detail="Waiting for your wallet to answer. Approve the request in the wallet if it asks." />}
      {lost && !reconnecting && (
        <Notice tone="info" icon={<PlugZap className="size-5" />} title="Wallet disconnected" detail="Your wallet is no longer connected. Connect it again to send, swap or bridge.">
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button type="button" onClick={show} className="cta min-h-9 px-4 text-xs font-semibold">
                Connect Wallet
              </button>
            )}
          </ConnectKitButton.Custom>
          <button type="button" onClick={() => setLost(false)} aria-label="Dismiss" className="ghost-btn flex size-8 items-center justify-center rounded-md">
            <X className="size-4" aria-hidden="true" />
          </button>
        </Notice>
      )}
    </div>
  )
}
