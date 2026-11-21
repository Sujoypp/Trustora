import { useMemo } from 'react'
import { useBytecode, useTransactionCount } from 'wagmi'
import type { Address } from 'viem'
import { CHAIN_ID, type Payment } from '@/lib/trustora'
import { useTrustRecords } from '@/hooks/useTrustoraData'
import { computeTrustScore, type TrustScore } from '@/lib/trustScore'

/** Live Trustora score for a wallet, computed from public Arc Mainnet data. */
export function useTrustScore(address: Address | undefined, balanceRaw: bigint | undefined, payments: Payment[]) {
  const enabled = Boolean(address)
  const { data: nonce } = useTransactionCount({
    address,
    chainId: CHAIN_ID,
    query: { enabled, refetchInterval: 15_000 },
  })
  const { data: code } = useBytecode({ address, chainId: CHAIN_ID, query: { enabled } })

  const records = useTrustRecords(address)
  const ready = enabled && nonce !== undefined && balanceRaw !== undefined
  const result: TrustScore | null = useMemo(
    () =>
      ready
        ? computeTrustScore({
            nonce,
            balanceRaw,
            hasCode: Boolean(code && code !== '0x'),
            payments,
            records,
          })
        : null,
    [ready, nonce, balanceRaw, code, payments, records],
  )

  return { enabled, result }
}
