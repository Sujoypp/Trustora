import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useDeployment } from '@/hooks/useTrustoraData'
import { NETWORK_NAME } from '@/lib/trustora'
import type { Address } from 'viem'

interface Props {
  address: Address | undefined
  env: string
  kind: 'escrow' | 'flows'
  /** Plain-language name of what the contract does, for the setup message. */
  feature: string
  children: ReactNode
}

/** Shows the screen only when its contract is configured, has code and uses the right USDC; otherwise explains what is missing. */
export function ContractGate({ address, env, kind, feature, children }: Props) {
  const deployment = useDeployment(address, kind)

  if (!address) {
    return (
      <section className="glass space-y-3 p-5 sm:p-6" role="status">
        <p className="flex items-center gap-2 font-semibold" style={{ color: 'var(--amber)' }}>
          <AlertTriangle className="size-4" aria-hidden="true" />
          {feature} is not set up yet
        </p>
        <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          This feature uses its own contract on {NETWORK_NAME}. Nothing here works until you deploy that contract from your own wallet (Arc Studio never deploys to mainnet), have it reviewed, and set its address:
        </p>
        <p className="mono rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {env}
        </p>
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          The contract takes the Circle USDC address on Arc as its one constructor argument. After setting the variable, restart the app. See the README for the steps.
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

  if (deployment.isError || deployment.data !== 'ready') {
    const reason =
      deployment.data === 'no-code'
        ? 'No contract code was found at the configured address on Arc Mainnet.'
        : deployment.data === 'wrong-usdc'
          ? 'This contract was deployed with a different USDC address than the one Circle publishes for Arc.'
          : 'The contract could not be read right now. Check your connection and try again.'
    return (
      <section className="glass space-y-2 p-5 sm:p-6" role="alert">
        <p className="flex items-center gap-2 font-semibold" style={{ color: 'var(--amber)' }}>
          <AlertTriangle className="size-4" aria-hidden="true" />
          {feature} is paused for safety
        </p>
        <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          {reason} Buttons stay off so no funds can be sent to a wrong contract.
        </p>
        <p className="mono break-all text-xs" style={{ color: 'var(--subtle)' }}>
          {address}
        </p>
      </section>
    )
  }

  return <>{children}</>
}
