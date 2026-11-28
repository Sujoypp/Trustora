import { useQuery } from '@tanstack/react-query'
import { createPublicClient, erc20Abi, http, type Address, type PublicClient } from 'viem'
import { getChain, getUsdc } from '@/onchain-facts'

/** Chains CCTP connects to Arc, with Arc first. Public RPC endpoints and Circle USDC addresses come from the chain registry. */
export const BREAKDOWN_CHAINS = [
  { id: 5042, label: 'Arc Mainnet' },
  { id: 1, label: 'Ethereum' },
  { id: 8453, label: 'Base' },
  { id: 42161, label: 'Arbitrum' },
  { id: 10, label: 'Optimism' },
  { id: 137, label: 'Polygon' },
  { id: 43114, label: 'Avalanche' },
] as const

export interface ChainBalance {
  id: number
  label: string
  /** USDC in 6-decimal units, or null when that chain's public RPC did not answer. */
  raw: bigint | null
}

const clients = new Map<number, PublicClient>()
function clientFor(chainId: number): PublicClient {
  let client = clients.get(chainId)
  if (!client) {
    const chain = getChain(chainId)
    client = createPublicClient({ transport: http(chain?.rpcUrls[0], { timeout: 8000, retryCount: 1, retryDelay: 600 }) })
    clients.set(chainId, client)
  }
  return client
}

/** Circle USDC balance of a wallet on one chain, read straight from that chain's public RPC. */
export async function readChainUsdc(chainId: number, owner: Address): Promise<bigint> {
  const usdc = getUsdc(chainId)
  if (!usdc) throw new Error(`No USDC address is known for chain ${chainId}`)
  return clientFor(chainId).readContract({ address: usdc.address as Address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })
}

/** USDC per chain. Only runs while `enabled` (the breakdown is opened) and refreshes about once a minute. */
export function useChainBalances(owner: Address | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['trustora', 'chain-balances', owner],
    enabled: Boolean(owner && enabled),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ChainBalance[]> => {
      if (!owner) return []
      return Promise.all(
        BREAKDOWN_CHAINS.map(async (c) => {
          try {
            return { id: c.id, label: c.label, raw: await readChainUsdc(c.id, owner) }
          } catch {
            return { id: c.id, label: c.label, raw: null }
          }
        }),
      )
    },
  })
}

/** USDC on one chain, for validating a bridge amount against the source chain. */
export function useChainUsdc(owner: Address | undefined, chainId: number | undefined) {
  return useQuery({
    queryKey: ['trustora', 'chain-usdc', chainId, owner],
    enabled: Boolean(owner && chainId),
    staleTime: 15_000,
    retry: 1,
    queryFn: () => (owner && chainId ? readChainUsdc(chainId, owner) : null),
  })
}
