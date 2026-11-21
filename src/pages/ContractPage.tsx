import { useBytecode, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { AlertTriangle, Check, ExternalLink, FileCode2, ListChecks, RefreshCw, Wallet } from 'lucide-react'
import { AddressBadge } from '@/components/AddressBadge'
import { EcosystemBadges } from '@/components/EcosystemBadges'
import { PageHeader } from '@/components/PageHeader'
import { Section } from '@/components/SettingsParts'
import { StatusPill } from '@/components/ActivityFeed'
import { TxLink } from '@/components/TxLink'
import { useApp } from '@/lib/appContext'
import { useContractStatus } from '@/lib/contractStatus'
import { formatUsdc, shortAddress, timeAgo } from '@/lib/format'
import { CHAIN_ID, NETWORK_NAME, ROUTER_ADDRESS, USDC_ADDRESS } from '@/lib/trustora'
import { buildAddressExplorerUrl } from '@/onchain-facts'

const FUNCTIONS = [
  { sig: 'sendNative(address recipient, string note)', note: 'Pays from the native balance. The contract forwards it and emits PaymentSent.' },
  { sig: 'sendToken(address token, address recipient, uint256 amount, string note)', note: 'Pays USDC straight from your wallet to the recipient after you approve the allowance.' },
] as const

/** Read-only view of the TrustoraPay contract on Arc Mainnet. */
export function ContractPage() {
  const { history, prefs } = useApp()
  const status = useContractStatus()
  const holdings = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: ROUTER_ADDRESS ? [ROUTER_ADDRESS] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(ROUTER_ADDRESS), refetchInterval: 15_000 },
  })
  const code = useBytecode({ address: ROUTER_ADDRESS, chainId: CHAIN_ID, query: { enabled: Boolean(ROUTER_ADDRESS) } })
  const codeBytes = code.data && code.data !== '0x' ? (code.data.length - 2) / 2 : null
  const mine = history.payments.filter((p) => p.direction !== 'received').slice(0, 8)

  const tone = status === 'verified' || status === 'live' ? 'var(--emerald)' : status === 'checking' ? 'var(--muted)' : 'var(--amber)'
  const label =
    status === 'verified' ? 'Live and verified' : status === 'live' ? 'Live on Arc Mainnet' : status === 'checking' ? 'Checking...' : status === 'missing' ? 'No code at this address' : 'Not configured yet'

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        actions={
          ROUTER_ADDRESS && (
            <button
              onClick={() => {
                void holdings.refetch()
                void code.refetch()
              }}
              className="ghost-btn flex min-h-10 items-center gap-2 border px-4 text-sm font-medium"
              style={{ borderColor: 'var(--border)' }}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </button>
          )
        }
      />

      <div className="mb-4">
        <EcosystemBadges />
      </div>

      <div className="space-y-4">
        <Section icon={<FileCode2 className="size-4" />} title="Contract status">
          <p className="flex items-center gap-2 text-lg font-semibold" style={{ color: tone }}>
            {status === 'verified' || status === 'live' ? <Check className="size-5" aria-hidden="true" /> : <AlertTriangle className="size-5" aria-hidden="true" />}
            {label}
          </p>
          {ROUTER_ADDRESS ? (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
                  Address
                </dt>
                <dd className="mt-1.5"><AddressBadge address={ROUTER_ADDRESS} /></dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
                  Network
                </dt>
                <dd className="mt-0.5">{NETWORK_NAME}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
                  Code size
                </dt>
                <dd className="mt-0.5 tabular-nums">{codeBytes !== null ? `${codeBytes.toLocaleString()} bytes` : '...'}</dd>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 sm:col-span-2">
                <a
                  href={`https://arc.etherscan.io/address/${ROUTER_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2"
                  style={{ color: '#a5b4fc' }}
                >
                  View on Arc Etherscan
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
                <a
                  href={buildAddressExplorerUrl(CHAIN_ID, ROUTER_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2"
                  style={{ color: '#a5b4fc' }}
                >
                  View on Arc Explorer
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </div>
            </dl>
          ) : (
            <div className="mt-3 space-y-2 text-sm" style={{ color: 'var(--muted)' }}>
              <p>
                No payment contract is set for {NETWORK_NAME}, so sending is off. Deploy the contract from your own wallet (Arc Studio does not deploy to mainnet for you), have it audited, then set
                these two values and restart the app:
              </p>
              <p className="mono rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.04)' }}>
                VITE_TRUSTORA_PAY_ADDRESS_MAINNET
                <br />
                VITE_TRUSTORA_PAY_DEPLOY_BLOCK_MAINNET
              </p>
            </div>
          )}
        </Section>

        <Section icon={<Wallet className="size-4" />} title="Holdings">
          <p className="display text-3xl font-semibold tabular-nums">
            {ROUTER_ADDRESS ? (holdings.data !== undefined ? formatUsdc(holdings.data) : '...') : '0.00'} <span className="text-base font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            The contract is built to pass payments straight through and never keep funds, so this should stay at zero. USDC is Arc&apos;s gas token, so this one figure covers both views of the same pool.
          </p>
        </Section>

        <Section icon={<ListChecks className="size-4" />} title="What it can do">
          <ul className="space-y-3">
            {FUNCTIONS.map((f) => (
              <li key={f.sig}>
                <p className="mono break-all text-xs" style={{ color: '#a5b4fc' }}>
                  {f.sig}
                </p>
                <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
                  {f.note}
                </p>
              </li>
            ))}
          </ul>
          <p className="mono mt-3 break-all text-[11px]" style={{ color: 'var(--subtle)' }}>
            event PaymentSent(address indexed sender, address indexed recipient, address indexed token, uint256 amount, string note, uint256 timestamp)
          </p>
        </Section>

        <Section icon={<ListChecks className="size-4" />} title="Your recent executions">
          {mine.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {ROUTER_ADDRESS ? 'Payments you send through the contract will be listed here.' : 'Nothing to show until the contract is configured.'}
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {mine.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="mono text-xs" style={{ color: '#a5b4fc' }}>
                      {p.rail === 'native' ? 'sendNative' : 'sendToken'}
                    </span>{' '}
                    <span style={{ color: 'var(--muted)' }}>
                      to {shortAddress(p.recipient)} · {timeAgo(p.timestamp)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{prefs.hideBalances ? '•••••' : formatUsdc(p.amountRaw)} USDC</span>
                    <StatusPill status={p.status} />
                    <TxLink hash={p.txHash} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}
