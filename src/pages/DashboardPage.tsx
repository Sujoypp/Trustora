import { PortfolioStrip } from '@/components/PortfolioStrip'
import { FeatureCard } from '@/components/FeatureCard'
import { NetworkMetrics } from '@/components/NetworkPill'
import { ContractIcon, HistoryIcon, SendIcon, VaultIcon } from '@/components/ToolIcons'
import { useTrustScore } from '@/hooks/useTrustScore'
import { useApp } from '@/lib/appContext'
import { useContractStatus, type ContractState } from '@/lib/contractStatus'
import { formatUsdc, shortAddress, timeAgo } from '@/lib/format'
import { MASK } from '@/lib/prefs'
import { NETWORK_NAME, ROUTER_ADDRESS } from '@/lib/trustora'

const CONTRACT_LABEL: Record<ContractState, string> = {
  'not-deployed': 'Not configured yet',
  checking: 'Checking...',
  live: `Live on ${NETWORK_NAME}`,
  verified: 'Live and verified',
  missing: 'No code at the address',
}

const muted = { color: 'var(--muted)' } as const
const strong = { color: 'var(--ink)' } as const

export function DashboardPage() {
  const app = useApp()
  const balanceRaw = app.balance?.raw
  const trust = useTrustScore(app.address, balanceRaw, app.history.payments)
  const contract = useContractStatus()
  const payments = app.history.payments
  const last = payments[0]
  const hide = app.prefs.hideBalances

  return (
    <div className="grid gap-4">
      <div className="rise relative z-20" style={{ '--i': 0 } as React.CSSProperties}>
        <PortfolioStrip
          connected={app.isConnected}
          balanceRaw={balanceRaw}
          loading={app.balanceLoading}
          hideBalance={hide}
          payments={payments}
          trustEnabled={trust.enabled}
          trust={trust.result}
        />
      </div>

      <section aria-label="Core tools" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FeatureCard
          title="Send & Receive"
          description="Instant peer-to-peer USDC transfers, plus a QR code and payment link to get paid."
          to="/send"
          icon={SendIcon}
          color="#6366f1"
          order={1}
        >
          <span style={muted}>Available </span>
          <span className="font-semibold tabular-nums" style={strong}>
            {app.isConnected && balanceRaw !== undefined ? `${hide ? MASK : formatUsdc(balanceRaw)} USDC` : 'Connect your wallet'}
          </span>
        </FeatureCard>

        <FeatureCard
          title="Smart Contract"
          description={`Live status, holdings and execution details of the payment contract on ${NETWORK_NAME}.`}
          to="/contract"
          icon={ContractIcon}
          color="#22d3ee"
          order={2}
        >
          <span className="font-semibold" style={{ color: contract === 'verified' || contract === 'live' ? 'var(--emerald)' : 'var(--amber)' }}>
            {CONTRACT_LABEL[contract]}
          </span>
          {ROUTER_ADDRESS && <span className="mono ml-2" style={muted}>{shortAddress(ROUTER_ADDRESS)}</span>}
        </FeatureCard>

        <FeatureCard
          title="Transaction History"
          description="A searchable live log of your transfers, with a digital receipt for each one."
          to="/history"
          icon={HistoryIcon}
          color="#22d3ee"
          order={3}
        >
          {last ? (
            <>
              <span className="font-semibold tabular-nums" style={strong}>
                {payments.length} {payments.length === 1 ? 'payment' : 'payments'}
              </span>
              <span style={muted}>
                {' '}
                · last {last.direction === 'received' ? 'received' : 'sent'} {hide ? MASK : formatUsdc(last.amountRaw)} USDC, {timeAgo(last.timestamp)}
              </span>
            </>
          ) : (
            <span style={muted}>No payments yet</span>
          )}
        </FeatureCard>

        <FeatureCard
          title="Security & Mainnet Status"
          description="Non-custodial security checks and live network health for Arc Mainnet."
          to="/vault"
          icon={VaultIcon}
          color="#6366f1"
          order={4}
        >
          <NetworkMetrics />
        </FeatureCard>
      </section>
    </div>
  )
}
