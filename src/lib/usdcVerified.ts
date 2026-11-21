import { erc20Abi } from 'viem'
import { useReadContract } from 'wagmi'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/trustora'

export type UsdcState = 'checking' | 'verified' | 'mismatch'

/**
 * The USDC address comes from the onchain facts registry (Circle's published address for Arc Mainnet).
 * This also asks the contract itself: it must report the symbol USDC and 6 decimals.
 */
export function useUsdcVerified(): UsdcState {
  const symbol = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'symbol', chainId: CHAIN_ID, query: { staleTime: 10 * 60_000 } })
  const decimals = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'decimals', chainId: CHAIN_ID, query: { staleTime: 10 * 60_000 } })
  if (symbol.isPending || decimals.isPending) return 'checking'
  return symbol.data === 'USDC' && decimals.data === 6 ? 'verified' : 'mismatch'
}
