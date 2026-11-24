import { useCallback, useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import type { Address, Hex } from 'viem'
import { CHAIN_ID, type Payment } from '@/lib/trustora'

const CHECK_MS = 6000
/** A transaction the network has never reported after this long is dropped from the pending list. */
const GIVE_UP_SECONDS = 30 * 60

interface StoredPayment extends Omit<Payment, 'blockNumber' | 'amountRaw'> {
  blockNumber: string
  amountRaw: string
}

const storageKey = (address: string) => `trustora:pending:${address.toLowerCase()}`

function load(address?: Address): Payment[] {
  if (!address) return []
  try {
    const raw = localStorage.getItem(storageKey(address))
    if (!raw) return []
    return (JSON.parse(raw) as StoredPayment[]).map((p) => ({ ...p, blockNumber: BigInt(p.blockNumber), amountRaw: BigInt(p.amountRaw) }))
  } catch {
    return []
  }
}

function save(address: Address, list: Payment[]) {
  try {
    if (list.length === 0) localStorage.removeItem(storageKey(address))
    else localStorage.setItem(storageKey(address), JSON.stringify(list.map((p) => ({ ...p, blockNumber: p.blockNumber.toString(), amountRaw: p.amountRaw.toString() }))))
  } catch {
    // storage unavailable: pending rows are then only kept for this session
  }
}

/**
 * Payments that were submitted but are not yet in confirmed history.
 * They survive a reload, and each one is checked against the chain until it confirms, reverts or is clearly lost.
 */
export function usePendingTracker(address: Address | undefined, onChanged: () => void) {
  const client = usePublicClient({ chainId: CHAIN_ID })
  const [state, setState] = useState<{ address?: Address; list: Payment[] }>(() => ({ address, list: load(address) }))
  const list = state.address === address ? state.list : load(address)

  const update = useCallback(
    (fn: (current: Payment[]) => Payment[]) =>
      setState((prev) => {
        const current = prev.address === address ? prev.list : load(address)
        const next = fn(current)
        if (address) save(address, next)
        return { address, list: next }
      }),
    [address],
  )

  const add = useCallback((payment: Payment) => update((l) => [payment, ...l.filter((p) => p.txHash !== payment.txHash)]), [update])
  const settle = useCallback(
    (txHash: Hex) => {
      // Keep the row until the confirmed log replaces it; the feed hides a pending row once its hash is confirmed.
      setTimeout(() => update((l) => l.filter((p) => p.txHash !== txHash)), 15_000)
    },
    [update],
  )

  const hasPending = list.length > 0
  useEffect(() => {
    if (!client || !hasPending) return
    const ctx = { cancelled: false }
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      const now = Math.floor(Date.now() / 1000)
      for (const payment of list) {
        try {
          const receipt = await client.getTransactionReceipt({ hash: payment.txHash })
          if (ctx.cancelled) return
          if (receipt.status === 'reverted') {
            toast.error('A payment failed on Arc Mainnet', { id: `reverted-${payment.txHash}`, description: `Transaction ${payment.txHash.slice(0, 10)}... was reverted. No funds moved.` })
          }
          update((l) => l.filter((p) => p.txHash !== payment.txHash))
          onChanged()
        } catch {
          // Not found yet: still pending. Only give up on something the network never reported.
          if (now - payment.timestamp > GIVE_UP_SECONDS) update((l) => l.filter((p) => p.txHash !== payment.txHash))
        }
      }
    }
    const timer = setInterval(() => void check(), CHECK_MS)
    void check()
    return () => {
      ctx.cancelled = true
      clearInterval(timer)
    }
  }, [client, hasPending, list, update, onChanged])

  return { pending: list, onPending: add, onSettled: settle }
}
