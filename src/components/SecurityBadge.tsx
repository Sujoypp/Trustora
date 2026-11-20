import { useState, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { AlertTriangle, BadgeCheck, Check, ExternalLink, Info, ShieldCheck } from 'lucide-react'
import { Popover } from '@/components/Popover'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { useContractStatus } from '@/lib/contractStatus'
import { cosignerValid, useGuard } from '@/lib/guard'
import { navigate } from '@/lib/router'
import { CHAIN_ID, ROUTER_ADDRESS, NETWORK_NAME } from '@/lib/trustora'

type Tone = 'ok' | 'warn' | 'info'

const TONE = {
  ok: { color: 'var(--emerald)', bg: 'rgba(16,185,129,0.12)', Icon: Check },
  warn: { color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)', Icon: AlertTriangle },
  info: { color: 'var(--muted)', bg: 'rgba(255,255,255,0.06)', Icon: Info },
} as const

function Row({ tone, title, detail, extra }: { tone: Tone; title: string; detail: string; extra?: ReactNode }) {
  const { color, bg, Icon } = TONE[tone]
  return (
    <li className="flex items-start gap-3 rounded-lg px-2 py-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md" style={{ background: bg, color }}>
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-pretty" style={{ color: 'var(--muted)' }}>
          {detail}
        </span>
        {extra}
      </span>
    </li>
  )
}

function Panel({ https, wrong, address }: { https: boolean; wrong: boolean; address?: `0x${string}` }) {
  const contract = useContractStatus()
  const [guard] = useGuard(address)
  const guardSet = guard.enabled && cosignerValid(guard.cosigner)

  return (
    <div className="p-1">
      <p className="eyebrow px-2 pb-1 pt-1">Security status</p>
      <ul>
        <Row
          tone={https ? 'ok' : 'warn'}
          title="Secure connection"
          detail={https ? 'This page is served over HTTPS.' : 'This page is not on HTTPS. Do not connect a wallet with real funds.'}
        />
        <Row tone="ok" title="Non-custodial" detail="Your wallet holds the keys and signs every payment. Trustora never sees them." />
        <Row
          tone={wrong ? 'warn' : 'ok'}
          title="Network"
          detail={wrong ? `Your wallet is on another network. Payments need ${NETWORK_NAME}.` : `${NETWORK_NAME}.`}
        />
        {contract === 'verified' ? (
          <Row
            tone="ok"
            title="Verified Smart Contract"
            detail="TrustoraPay is live and its source is verified on the explorer."
            extra={
              ROUTER_ADDRESS && (
                <a
                  href={buildAddressExplorerUrl(CHAIN_ID, ROUTER_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium"
                  style={{ color: '#a5b4fc' }}
                >
                  View contract <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )
            }
          />
        ) : (
          <Row
            tone="info"
            title="Smart contract"
            detail={
              contract === 'not-deployed'
                ? 'TrustoraPay is not deployed yet, so there is nothing to verify.'
                : contract === 'checking'
                  ? `Checking the contract on ${NETWORK_NAME}.`
                  : contract === 'missing'
                    ? 'No contract code was found at the configured address.'
                    : 'Live onchain. Source verification could not be confirmed from here.'
            }
          />
        )}
        <Row
          tone={guardSet ? 'warn' : 'info'}
          title="Multisig vault guard"
          detail={
            guardSet
              ? `Draft 2-of-2 policy above ${guard.threshold.toLocaleString()} USDC. Preview only: approvals are not enforced onchain.`
              : 'Off. An optional 2-of-2 guard preview is on the send form.'
          }
          extra={
            <button type="button" onClick={() => navigate('/send')} className="mt-1 text-xs font-medium" style={{ color: '#a5b4fc' }}>
              Open send form
            </button>
          }
        />
        <Row tone="info" title="Local data" detail="Preferences, reminders and cached history live in this browser and are not encrypted." />
        <Row tone="info" title="Independent audit" detail="None yet. The contract has had an automated and AI-assisted review only." />
      </ul>
    </div>
  )
}

/** Header shield: green when the basics check out, amber when something needs attention. Opens the details. */
export function SecurityBadge() {
  const { isConnected, chainId, address } = useAccount()
  const [open, setOpen] = useState(false)
  const https = window.location.protocol === 'https:'
  const wrong = isConnected && chainId !== CHAIN_ID
  const ok = https && !wrong
  const Icon = ok ? BadgeCheck : ShieldCheck

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width={340}
      rootClassName="static sm:relative"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={ok ? 'Security status: all checks pass' : 'Security status: needs attention'}
          className="ghost-btn pill hidden min-h-9 items-center gap-1.5 border px-2.5 text-xs font-medium sm:flex"
          style={{ borderColor: ok ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.5)', color: ok ? 'var(--emerald)' : 'var(--amber)' }}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="hidden xl:inline">Security</span>
        </button>
      }
    >
      <Panel https={https} wrong={wrong} address={address} />
    </Popover>
  )
}
