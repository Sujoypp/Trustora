import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/trustora'

/**
 * The single spendable USDC balance (ERC-20 view, 6 decimals). On Arc this is the
 * same pool that pays gas, so the native balance is never read or shown separately.
 */
export function useUsdcBalance(address?: Address) {
  const query = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 6000 },
  })

  const balance = useMemo(
    () => (query.data !== undefined ? Amount.fromRaw(query.data, usdcDecimalsFor(CHAIN_ID)) : undefined),
    [query.data],
  )

  return { balance, isLoading: query.isLoading, refetch: query.refetch }
}
