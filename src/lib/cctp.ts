import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { CHAIN_ID } from '@/lib/trustora'

/**
 * Circle's cross-chain transfer protocol (CCTP) on Arc Mainnet, from the Arc contract addresses page
 * (https://docs.arc.io/arc/references/contract-addresses.md). Arc's CCTP domain is 26.
 */
export const CCTP_DOMAIN = 26
export const CCTP_CONTRACTS: Record<string, Address> = {
  TokenMessengerV2: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
  MessageTransmitterV2: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
}

export type CctpState = 'checking' | 'ready' | 'unavailable'

/** Ready when both core CCTP contracts have code on Arc Mainnet right now. */
export function useCctpReadiness(): CctpState {
  const client = usePublicClient({ chainId: CHAIN_ID })
  const query = useQuery({
    queryKey: ['cctp-readiness', CHAIN_ID],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return false
      const codes = await Promise.all(Object.values(CCTP_CONTRACTS).map((address) => client.getCode({ address })))
      return codes.every((code) => Boolean(code) && code !== '0x')
    },
  })
  if (query.isPending) return 'checking'
  return query.data ? 'ready' : 'unavailable'
}
