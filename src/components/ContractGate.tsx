import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { useDeployment } from '@/hooks/useTrustoraData'
import { CHAIN_ID, NETWORK_NAME } from '@/lib/trustora'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import type { Address } from 'viem'

interface Props {
  address: Address | undefined
  /** The environment variable holds something, but it is not a valid address. */
  invalid?: boolean
  env: string
  kind: 'escrow' | 'flows'
  /** Plain-language name of what the contract does, for the setup message. */
  feature: string
  children: ReactNode
}

/**
 * Shows the screen only when its contract passes every check against Arc Mainnet: valid address, chain 5042, code at the
 * address, the Circle USDC address, and a token that answers as 6-decimal USDC. Otherwise it explains exactly what is wrong.
 */
export function ContractGate({ address, invalid = false, env, kind, feature, children }: Props) {
  const deployment = useDeployment(address, kind)

  if (!address) {
    return (
      <section className="glass space-y-3 p-5 sm:p-6" role="status">
        <p className="flex items-center gap-2 font-semibold" style={{ color: 'var(--amber)' }}>
          <AlertTriangle className="size-4" aria-hidden="true" />
          {invalid ? `${feature} has an invalid contract address` : `${feature} is not set up yet`}
        </p>
        <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          {invalid
            ? `The value of ${env} is not a valid contract address. It must start with 0x and have 40 hexadecimal characters. Fix it, then restart or rebuild the app.`
            : `This feature uses its own contract on ${NETWORK_NAME}. Nothing here works until you deploy that contract from your own wallet (Arc Studio never deploys to mainnet), have it reviewed, and set its address:`}
        </p>
        <p className="mono rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {env}
        </p>
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          The contract takes the Circle USDC address on Arc as its one constructor argument. The README has a checked deployment script and the final configuration steps.
        </p>
      </section>
    )
  }

  if (deployment.isPending) {
    return (
      <section className="glass flex items-center gap-2 p-5 text-sm" style={{ color: 'var(--muted)' }} role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Checking the contract on {NETWORK_NAME}...
      </section>
    )
  }

  const result = deployment.data
  if (deployment.isError || !result || !result.ready) {
    const checks = result?.checks ?? []
    return (
      <section className="glass space-y-3 p-5 sm:p-6" role="alert">
        <p className="flex items-center gap-2 font-semibold" style={{ color: 'var(--amber)' }}>
          <AlertTriangle className="size-4" aria-hidden="true" />
          {feature} is paused for safety
        </p>
        <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          The contract did not pass every check, so buttons stay off and no funds can be sent to a wrong contract.
        </p>
        {checks.length > 0 ? (
          <ul className="space-y-2">
            {checks.map((c) => (
              <li key={c.id} className="glass-inner flex items-start gap-2.5 p-3 text-sm">
                {c.ok === true ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--emerald)' }} aria-label="Passed" />
                ) : c.ok === false ? (
                  <XCircle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} aria-label="Failed" />
                ) : (
                  <CircleDashed className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--subtle)' }} aria-label="Not checked" />
                )}
                <span>
                  <span className="block font-medium">{c.label}</span>
                  <span className="block text-xs" style={{ color: 'var(--muted)' }}>{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>The contract could not be read right now. Check your connection and try again.</p>
        )}
        <p className="mono break-all text-xs" style={{ color: 'var(--subtle)' }}>{address}</p>
      </section>
    )
  }

  return (
    <>
      <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--muted)' }}>
        <span className="chip chip-ok">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          Contract checks passed
        </span>
        <span>{NETWORK_NAME} · chain {CHAIN_ID} · Circle USDC</span>
        <a href={buildAddressExplorerUrl(CHAIN_ID, address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2" style={{ color: '#a9c6ff' }}>
          View contract <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </p>
      {children}
    </>
  )
}
