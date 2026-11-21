import { ArrowDownLeft, ArrowUpRight, BadgeCheck, BadgeCheck as ProofIcon, CalendarClock, ExternalLink, FileText, Handshake, Link2, Network, QrCode, Split } from 'lucide-react'
import { AddressBadge } from '@/components/AddressBadge'
import { StatusPill } from '@/components/ActivityFeed'
import { PortfolioStrip } from '@/components/PortfolioStrip'
import { FeatureCard } from '@/components/FeatureCard'
import { NetworkMetrics } from '@/components/NetworkPill'
import { BridgeIcon, ContractIcon, HistoryIcon, SendIcon, SwapIcon, VaultIcon } from '@/components/ToolIcons'
import { ESCROW_ADDRESS, FLOWS_ADDRESS } from '@/lib/contracts'
import { useTrustScore } from '@/hooks/useTrustScore'
import { useApp } from '@/lib/appContext'
import { useCctpReadiness, type CctpState } from '@/lib/cctp'
import { useContractStatus, type ContractState } from '@/lib/contractStatus'
import { formatUsdc, timeAgo } from '@/lib/format'
import { MASK } from '@/lib/prefs'
import { paymentToReceipt } from '@/lib/receipt'
import { navigate } from '@/lib/router'
import { CHAIN_ID, NETWORK_NAME, ROUTER_ADDRESS } from '@/lib/trustora'
import { buildAddressExplorerUrl } from '@/onchain-facts'

const CONTRACT_LABEL: Record<ContractState, string> = {
  'not-deployed': 'Not configured yet',
  checking: 'Checking...',
  live: `Live on ${NETWORK_NAME}`,
  verified: 'Live and verified',
  missing: 'No code at the address',
}

const CCTP_LABEL: Record<CctpState, string> = {
  checking: 'Checking CCTP...',
  ready: 'CCTP Ready',
  unavailable: 'CCTP unavailable',
}

const TOOLS = [
  { to: '/escrow', title: 'Escrow & Agreements', description: 'Hold USDC until conditions are met: smart escrow, milestone payments and trust agreements.', icon: Handshake, contract: Boolean(ESCROW_ADDRESS) },
  { to: '/invoices', title: 'Smart Invoices', description: 'Create, share and pay invoices recorded onchain.', icon: FileText, contract: Boolean(FLOWS_ADDRESS) },
  { to: '/links', title: 'Payment Links', description: 'Shareable USDC payment links and QR codes.', icon: Link2, contract: undefined },
  { to: '/split', title: 'Split Payments', description: 'Send one payment to several wallets in a single transaction.', icon: Split, contract: Boolean(FLOWS_ADDRESS) },
  { to: '/recurring', title: 'Recurring Payments', description: 'Schedule authorized recurring USDC payments.', icon: CalendarClock, contract: Boolean(FLOWS_ADDRESS) },
  { to: '/proof', title: 'Onchain Proof', description: 'Verify transactions and records straight from Arc Mainnet.', icon: ProofIcon, contract: undefined },
] as const

const muted = { color: 'var(--muted)' } as const
const strong = { color: 'var(--ink)' } as const
const linkStyle = { color: '#a5b4fc' } as const

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium"
      style={{ background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: ok ? 'var(--emerald)' : 'var(--amber)' }}
    >
      {children}
    </span>
  )
}

export function DashboardPage() {
  const app = useApp()
  const balanceRaw = app.balance?.raw
  const trust = useTrustScore(app.address, balanceRaw, app.history.payments)
  const contract = useContractStatus()
  const cctp = useCctpReadiness()
  const payments = app.history.payments
  const recent = payments.slice(0, 3)
  const hide = app.prefs.hideBalances
  const contractOk = contract === 'verified' || contract === 'live'

  return (
    <div className="grid gap-4">
      <div className="rise relative z-20" style={{ '--i': 0 } as React.CSSProperties}>
        <PortfolioStrip
          connected={app.isConnected}
          balanceRaw={balanceRaw}
          loading={app.balanceLoading}
          hideBalance={hide}
          payments={payments}
        />
      </div>

      <section aria-label="Core tools" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          title="Send & Receive"
          description="Instant peer-to-peer USDC transfers, a QR code to get paid, and an optional gasless-pay preview."
          to="/send"
          icon={SendIcon}
          color="#6366f1"
          order={1}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span>
              <span style={muted}>Available </span>
              <span className="font-semibold tabular-nums" style={strong}>
                {app.isConnected && balanceRaw !== undefined ? `${hide ? MASK : formatUsdc(balanceRaw)} USDC` : 'Connect your wallet'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => navigate('/receive')}
              className="ghost-btn flex min-h-8 items-center gap-1.5 border px-3 text-xs font-medium"
              style={{ borderColor: 'var(--border)', color: '#a5b4fc' }}
            >
              <QrCode className="size-3.5" aria-hidden="true" />
              Receive with QR
            </button>
          </div>
        </FeatureCard>

        <FeatureCard
          title="Swap"
          description="Fast, low-slippage swaps between USDC, EURC and cirBTC on Arc Mainnet, with a live rate preview."
          to="/swap"
          icon={SwapIcon}
          color="#22d3ee"
          order={2}
        >
          <span className="font-semibold" style={strong}>
            USDC • EURC • cirBTC
          </span>
          <span style={muted}> · quote before you swap</span>
        </FeatureCard>

        <FeatureCard
          title="Bridge"
          description="Move native USDC between Arc Mainnet and other chains with Circle's Cross-Chain Transfer Protocol."
          to="/bridge"
          icon={BridgeIcon}
          color="#6366f1"
          order={3}
        >
          <Chip ok={cctp === 'ready'}>
            <Network className="size-3.5" aria-hidden="true" />
            {CCTP_LABEL[cctp]}
          </Chip>
        </FeatureCard>

        <FeatureCard
          title="Smart Contract"
          description={`The Trustora payment contract on ${NETWORK_NAME}: address, live status and explorer link.`}
          to="/contract"
          icon={ContractIcon}
          color="#22d3ee"
          order={4}
        >
          <div className="space-y-2.5">
            <span className="flex items-center gap-1.5 font-semibold" style={{ color: contractOk ? 'var(--emerald)' : 'var(--amber)' }}>
              {contractOk && <BadgeCheck className="size-4" aria-hidden="true" />}
              {CONTRACT_LABEL[contract]}
            </span>
            {ROUTER_ADDRESS ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <AddressBadge address={ROUTER_ADDRESS} short />
                <a
                  href={buildAddressExplorerUrl(CHAIN_ID, ROUTER_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
                  style={linkStyle}
                >
                  Verify on Arc Explorer
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </div>
            ) : (
              <span style={muted}>Set the contract address to turn on sending.</span>
            )}
          </div>
        </FeatureCard>

        <FeatureCard
          title="Transaction History"
          description="Your latest activity. Select a payment to open its digital receipt."
          to="/history"
          icon={HistoryIcon}
          color="#6366f1"
          order={5}
        >
          {recent.length === 0 ? (
            <span style={muted}>No payments yet</span>
          ) : (
            <ul className="-my-1">
              {recent.map((p) => {
                const received = p.direction === 'received'
                const Arrow = received ? ArrowDownLeft : ArrowUpRight
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => app.openReceipt(paymentToReceipt(p))}
                      className="flex w-full items-center justify-between gap-3 rounded-md py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.04]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Arrow className="size-3.5 shrink-0" style={{ color: received ? 'var(--emerald)' : '#a5b4fc' }} aria-hidden="true" />
                        <span className="truncate font-medium tabular-nums" style={strong}>
                          {received ? '+' : '-'}
                          {hide ? MASK : formatUsdc(p.amountRaw)} USDC
                        </span>
                        <span className="hidden shrink-0 sm:inline" style={muted}>
                          {timeAgo(p.timestamp)}
                        </span>
                      </span>
                      <StatusPill status={p.status} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </FeatureCard>

        <FeatureCard
          title="Trustora Score & Mainnet Status"
          description="Your transparent reputation score, self-custody status, CCTP readiness and live network health."
          to="/vault"
          icon={VaultIcon}
          color="#22d3ee"
          order={6}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="display text-xl font-bold tabular-nums" style={strong}>
                {trust.result ? trust.result.score : '--'}
              </span>
              <span style={muted}>/ 100</span>
              {trust.result && <span className="font-semibold" style={{ color: trust.result.score >= 70 ? 'var(--emerald)' : '#a5b4fc' }}>{trust.result.tier}</span>}
              {!trust.enabled && <span style={muted}>Connect to see your score</span>}
            </div>
            <div style={muted}>
              <NetworkMetrics />
            </div>
          </div>
        </FeatureCard>
      </section>

      <section aria-label="Payment tools" className="space-y-3">
        <h2 className="eyebrow">Payment tools</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool, i) => (
            <FeatureCard key={tool.to} title={tool.title} description={tool.description} to={tool.to} icon={tool.icon} color={i % 2 ? '#22d3ee' : '#6366f1'} order={7 + i}>
              <span className="font-semibold" style={{ color: tool.contract ? 'var(--emerald)' : tool.contract === undefined ? 'var(--muted)' : 'var(--amber)' }}>
                {tool.contract === undefined ? 'Works with your wallet' : tool.contract ? 'Contract configured' : 'Contract not set up yet'}
              </span>
            </FeatureCard>
          ))}
        </div>
      </section>
    </div>
  )
}
