import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { requireChain } from '@/onchain-facts'
import { CHAIN_ID, ROUTER_ADDRESS } from '@/lib/trustora'

export type ContractState = 'not-deployed' | 'checking' | 'verified' | 'live' | 'missing'

/**
 * What can be confirmed about the TrustoraPay contract right now.
 * "live" means code exists at the address; "verified" means the explorer also reports verified source.
 * If the explorer cannot be reached the state stays "live" and says nothing about verification.
 */
export function useContractStatus(): ContractState {
  const client = usePublicClient({ chainId: CHAIN_ID })
  const [state, setState] = useState<ContractState>('checking')

  useEffect(() => {
    if (!ROUTER_ADDRESS || !client) return
    const ctx = { cancelled: false }
    const set = (next: ContractState) => {
      if (!ctx.cancelled) setState(next)
    }
    void (async () => {
      try {
        const code = await client.getCode({ address: ROUTER_ADDRESS })
        if (!code || code === '0x') return set('missing')
        set('live')
        const base = requireChain(CHAIN_ID).explorerBase
        const res = await fetch(`${base}/api/v2/smart-contracts/${ROUTER_ADDRESS}`)
        if (!res.ok) return
        const data = (await res.json()) as { is_verified?: boolean }
        if (data.is_verified === true) set('verified')
      } catch {
        // Explorer unreachable or blocked: keep what we already know.
      }
    })()
    return () => {
      ctx.cancelled = true
    }
  }, [client])

  return ROUTER_ADDRESS ? state : 'not-deployed'
}
