import { useAccount } from 'wagmi'
import { Activity, AlertTriangle, Check, Info, ExternalLink, Lock, ShieldCheck, Users } from 'lucide-react'
import { MultisigGuard } from '@/components/MultisigGuard'
import { NetworkMetrics } from '@/components/NetworkPill'
import { PageHeader } from '@/components/PageHeader'
import { SecurityPrefs } from '@/components/SecurityPrefs'
import { Section } from '@/components/SettingsParts'
import { useApp } from '@/lib/appContext'
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
  const { address } = useApp()
  const { isConnected, chainId } = useAccount()
  const contract = useContractStatus()
  const [guard, patchGuard] = useGuard(address)
  const secure = window.location.protocol === 'https:'
  const wrong = isConnected && chainId !== CHAIN_ID

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader />
      <div className="space-y-4">
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
