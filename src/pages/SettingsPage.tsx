import { useEffect, useState } from 'react'
import { useAccount, useDisconnect, usePublicClient, useSwitchChain } from 'wagmi'
import { formatGwei } from 'viem'
import { toast } from 'sonner'
import { ExternalLink, LogOut, Network, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Section } from '@/components/SettingsParts'
import { navigate } from '@/lib/router'
import { useApp } from '@/lib/appContext'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { CHAIN, CHAIN_ID, ROUTER_ADDRESS, NETWORK_NAME } from '@/lib/trustora'
import { shortAddress } from '@/lib/format'

type Probe = { ok: true; ms: number; block: bigint } | { ok: false } | null

function rpcHost(): string {
  try {
    return new URL(CHAIN.rpcUrls[0]).host
  } catch {
    return CHAIN.rpcUrls[0]
  }
}

export function SettingsPage() {
  const { gasPrice } = useApp()
  const { address, isConnected, chainId } = useAccount()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending } = useSwitchChain()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const [probe, setProbe] = useState<Probe>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (!client) return
    const ctx = { cancelled: false }
    const run = async () => {
      const started = performance.now()
      try {
        const block = await client.getBlockNumber()
        if (!ctx.cancelled) setProbe({ ok: true, ms: Math.round(performance.now() - started), block })
      } catch {
        if (!ctx.cancelled) setProbe({ ok: false })
      }
    }
    void run()
    const timer = setInterval(() => void run(), 10_000)
    return () => {
      ctx.cancelled = true
      clearInterval(timer)
    }
  }, [client])

  const status =
    probe === null
      ? { label: 'Checking...', color: 'var(--amber)' }
      : !probe.ok
        ? { label: 'Unreachable', color: 'var(--danger)' }
        : probe.ms > 1500
          ? { label: 'Slow', color: 'var(--amber)' }
          : { label: 'Operational', color: 'var(--emerald)' }

  const clearData = () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('trustora:'))
      .forEach((k) => localStorage.removeItem(k))
    window.dispatchEvent(new Event('trustora:store'))
    setConfirmClear(false)
    toast.success('Local data cleared')
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader />
      <div className="grid gap-5">
        <Section icon={<Network className="size-4" />} title={`${NETWORK_NAME} RPC status`}>
          <div className="mb-4 flex items-center gap-2.5">
            <span className="live-dot size-2.5 rounded-full" style={{ background: status.color }} />
            <span className="display text-lg font-semibold" style={{ color: status.color }}>
              {status.label}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <Info label="Network" value={NETWORK_NAME} />
            <Info label="Chain ID" value={String(CHAIN_ID)} mono />
            <Info label="RPC host" value={rpcHost()} mono />
            <Info label="Latest block" value={probe?.ok ? `#${probe.block.toString()}` : '--'} mono />
            <Info label="Response time" value={probe?.ok ? `${probe.ms} ms` : '--'} />
            <Info label="Gas price" value={gasPrice !== undefined ? `${Number(formatGwei(gasPrice)).toLocaleString(undefined, { maximumFractionDigits: 2 })} gwei` : '--'} />
          </dl>

          {isConnected && chainId !== CHAIN_ID && (
            <div
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
              style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.07)' }}
            >
              <span className="flex items-center gap-2" style={{ color: 'var(--amber)' }}>
                <TriangleAlert className="size-4" />
                Your wallet is on a different network.
              </span>
              <button
                onClick={() => switchChain({ chainId: CHAIN_ID })}
                disabled={isPending}
                className="cta min-h-10 rounded-full px-5 text-xs font-semibold"
              >
                {isPending ? 'Switching...' : `Switch to ${NETWORK_NAME}`}
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm" style={{ borderColor: 'var(--border)' }}>
            <div>
              <p className="font-semibold">Payment contract</p>
              <p className="mono text-xs" style={{ color: 'var(--muted)' }}>
                {ROUTER_ADDRESS ? shortAddress(ROUTER_ADDRESS, 10, 8) : 'Not deployed yet'}
              </p>
            </div>
            {ROUTER_ADDRESS && (
              <a
                href={buildAddressExplorerUrl(CHAIN_ID, ROUTER_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="ghost-btn flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-semibold"
                style={{ borderColor: 'var(--border-hot)', color: 'var(--ink)' }}
              >
                <ExternalLink className="size-3.5" />
                View on explorer
              </a>
            )}
          </div>
        </Section>

        <Section icon={<ShieldCheck className="size-4" />} title="Security">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Balance privacy, large-payment warnings and the multisig guard live in the Security Vault.
          </p>
          <button onClick={() => navigate('/vault')} className="cta mt-4 min-h-10 px-5 text-sm font-semibold">
            Open Security Vault
          </button>
        </Section>

        <Section icon={<LogOut className="size-4" />} title="Wallet and data">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{isConnected ? 'Connected wallet' : 'No wallet connected'}</p>
              {address && (
                <p className="mono text-xs" style={{ color: 'var(--muted)' }}>
                  {shortAddress(address, 10, 8)}
                </p>
              )}
            </div>
            {isConnected && (
              <button
                onClick={() => disconnect()}
                className="ghost-btn flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}
              >
                <LogOut className="size-3.5" />
                Disconnect
              </button>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
            <div className="max-w-sm">
              <p className="text-sm font-semibold">Clear local data</p>
              <p className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
                Removes preferences, reminders and cached history from this browser. Nothing onchain changes.
              </p>
            </div>
            {confirmClear ? (
              <div className="flex gap-2">
                <button onClick={clearData} className="min-h-10 rounded-full px-4 text-xs font-semibold" style={{ background: 'rgba(251,113,133,0.16)', color: 'var(--danger)' }}>
                  Clear everything
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="ghost-btn min-h-10 rounded-full border px-4 text-xs font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="ghost-btn flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
              >
                <Trash2 className="size-3.5" />
                Clear data
              </button>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        {label}
      </dt>
      <dd className={`mt-0.5 truncate font-medium tabular-nums ${mono ? 'mono text-xs sm:text-sm' : ''}`}>{value}</dd>
    </div>
  )
}
