import { useAccount } from 'wagmi'
import { Activity, BadgeCheck, AlertTriangle, Check, Info, ExternalLink, Lock, ShieldCheck, Users } from 'lucide-react'
import { MultisigGuard } from '@/components/MultisigGuard'
import { NetworkMetrics } from '@/components/NetworkPill'
import { PageHeader } from '@/components/PageHeader'
import { SecurityPrefs } from '@/components/SecurityPrefs'
import { Section } from '@/components/SettingsParts'
import { useTrustScore } from '@/hooks/useTrustScore'
import { useApp } from '@/lib/appContext'
import { CCTP_DOMAIN, useCctpReadiness } from '@/lib/cctp'
import { useContractStatus } from '@/lib/contractStatus'
import { cosignerValid, useGuard } from '@/lib/guard'
import { CHAIN_ID, ROUTER_ADDRESS, NETWORK_NAME } from '@/lib/trustora'
import { buildAddressExplorerUrl } from '@/onchain-facts'

type Tone = 'ok' | 'warn' | 'info'

function StatusRow({ tone, title, detail }: { tone: Tone; title: string; detail: string }) {
  const Icon = tone === 'ok' ? Check : tone === 'warn' ? AlertTriangle : Info
  const color = tone === 'ok' ? 'var(--emerald)' : tone === 'warn' ? 'var(--amber)' : 'var(--muted)'
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color }} aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {detail}
        </p>
      </div>
    </li>
  )
}

/** One place for protection settings and live security checks. */
export function SecurityVaultPage() {
  const { address, balance, history } = useApp()
  const trust = useTrustScore(address, balance?.raw, history.payments)
  const { isConnected, chainId } = useAccount()
  const contract = useContractStatus()
  const cctp = useCctpReadiness()
  const [guard, patchGuard] = useGuard(address)
  const secure = window.location.protocol === 'https:'
  const wrong = isConnected && chainId !== CHAIN_ID

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader />
      <div className="space-y-4">
        <Section icon={<BadgeCheck className="size-4" />} title="Trustora Score">
          {trust.result ? (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="display text-4xl font-bold tabular-nums">{trust.result.score}</span>
                <span style={{ color: 'var(--muted)' }}>/ 100</span>
                <span className="font-semibold" style={{ color: trust.result.score >= 70 ? 'var(--emerald)' : '#a5b4fc' }}>
                  {trust.result.tier}
                </span>
              </p>
              <ul className="mt-4 space-y-3">
                {trust.result.factors.map((f) => (
                  <li key={f.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{f.label}</span>
                      <span className="tabular-nums" style={{ color: 'var(--muted)' }}>
                        {f.points} / {f.max}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(f.points / f.max) * 100}%`, background: 'linear-gradient(to right, #6366f1, #22d3ee)' }} />
                    </div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                      {f.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {trust.enabled ? 'Calculating...' : 'Connect your wallet to see your score.'}
            </p>
          )}
          <p className="mt-4 text-xs" style={{ color: 'var(--subtle)' }}>
            Calculated in your browser from public {NETWORK_NAME} data. It is a Trustora signal, not an Arc or Circle rating.
          </p>
        </Section>

        <Section icon={<Activity className="size-4" />} title={`${NETWORK_NAME} status`}>
          <div className="text-sm">
            <NetworkMetrics />
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            Block height, your node&apos;s measured response time and the current gas price, refreshed every few seconds.
          </p>
        </Section>

        <Section icon={<ShieldCheck className="size-4" />} title="Security status">
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            <StatusRow tone="ok" title="Non-custodial" detail="Your wallet holds the keys and signs every payment. Trustora never has access to your funds." />
            <StatusRow tone={secure ? 'ok' : 'warn'} title="Encrypted connection" detail={secure ? 'This page is served over HTTPS.' : 'This page is not served over HTTPS.'} />
            <StatusRow
              tone={!isConnected ? 'info' : wrong ? 'warn' : 'ok'}
              title={`Wallet on ${NETWORK_NAME}`}
              detail={!isConnected ? 'Connect a wallet to check.' : wrong ? 'Your wallet is on another network.' : 'Your wallet is on the right network.'}
            />
            <StatusRow
              tone={cctp === 'ready' ? 'ok' : cctp === 'checking' ? 'info' : 'warn'}
              title="CCTP cross-chain readiness"
              detail={
                cctp === 'ready'
                  ? `Circle's TokenMessengerV2 and MessageTransmitterV2 both have code on ${NETWORK_NAME} (CCTP domain ${CCTP_DOMAIN}), so USDC can move to and from other chains.`
                  : cctp === 'checking'
                    ? 'Checking the CCTP contracts...'
                    : `Could not find both CCTP contracts on ${NETWORK_NAME} right now.`
              }
            />
            <StatusRow
              tone={contract === 'verified' ? 'ok' : contract === 'live' ? 'info' : 'warn'}
              title="Payment contract"
              detail={
                !ROUTER_ADDRESS
                  ? `No payment contract is configured for ${NETWORK_NAME} yet. Sending is off until you deploy one.`
                  : contract === 'verified'
                    ? 'Live onchain with verified source.'
                    : contract === 'live'
                      ? 'Live onchain. Source verification not confirmed.'
                      : contract === 'checking'
                        ? 'Checking...'
                        : 'No contract code found at the configured address.'
              }
            />
            <StatusRow tone="info" title="Independent audit" detail="None recorded. Get a professional audit before relying on the contract with real funds." />
          </ul>
          {ROUTER_ADDRESS && (
            <a
              href={buildAddressExplorerUrl(CHAIN_ID, ROUTER_ADDRESS)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs underline underline-offset-2"
              style={{ color: '#a5b4fc' }}
            >
              View the contract on the explorer
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
        </Section>

        <Section icon={<Lock className="size-4" />} title="Privacy and spending protection">
          <SecurityPrefs />
        </Section>

        <Section icon={<Users className="size-4" />} title="Multisig guard (preview)">
          <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
            Set a threshold and a co-signer. Above it, the send form asks for an extra confirmation. Co-signer approval is not enforced onchain yet.
          </p>
          <MultisigGuard guard={guard} onChange={patchGuard} triggered={false} />
          {guard.enabled && !cosignerValid(guard.cosigner) && (
            <p className="mt-2 text-xs" style={{ color: 'var(--amber)' }}>
              Add a valid co-signer address to complete the policy.
            </p>
          )}
        </Section>
      </div>
    </div>
  )
}
