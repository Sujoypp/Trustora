import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { zeroAddress, type Address } from 'viem'
import { Amount, gasTokenToUsdc } from '@/onchain-money'
import { requireChain } from '@/onchain-facts'
import { scanPaymentLogs, type RawPaymentLog } from '@/lib/historyScan'
import { loadStaticIndex } from '@/lib/staticIndex'
import {
  CHAIN_ID,
  ROUTER_ADDRESS,
  ROUTER_DEPLOY_BLOCK,
  USDC_ADDRESS,
  type Payment,
} from '@/lib/trustora'

/** Used only when the deployment block is not configured: recent activity, never block 0. */
const FALLBACK_LOOKBACK = 5000n
const POLL_MS = 4000


interface StoredPayment extends Omit<Payment, 'blockNumber' | 'amountRaw'> {
  blockNumber: string
  amountRaw: string
}

interface Cache {
  lastBlock: string
  items: StoredPayment[]
}

const serialize = (p: Payment): StoredPayment => ({
  ...p,
  blockNumber: p.blockNumber.toString(),
  amountRaw: p.amountRaw.toString(),
})

const deserialize = (p: StoredPayment): Payment => ({
  ...p,
  blockNumber: BigInt(p.blockNumber),
  amountRaw: BigInt(p.amountRaw),
})

export interface HistoryProgress {
  scanned: bigint
  head: bigint
}

interface HistoryState {
  key: string
  payments: Payment[]
  progress: HistoryProgress | null
  isLoading: boolean
  error: string | null
}

const emptyState = (key: string): HistoryState => ({ key, payments: [], progress: null, isLoading: false, error: null })

function sortPayments(list: Payment[]): Payment[] {
  return list.sort((a, b) =>
    a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1,
  )
}

function toPayment(log: RawPaymentLog, me: string): Payment | null {
  const { sender, recipient, token, amount, note, timestamp } = log.args
  if (!sender || !recipient || !token || amount === undefined || timestamp === undefined) return null
  if (!log.transactionHash || log.blockNumber === null || log.logIndex === null) return null

  let rail: Payment['rail']
  let amountRaw: bigint
  if (token === zeroAddress) {
    rail = 'native'
    amountRaw = gasTokenToUsdc(CHAIN_ID, Amount.fromRaw(amount, requireChain(CHAIN_ID).nativeCurrency.decimals)).raw
  } else if (token.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
    rail = 'erc20'
    amountRaw = amount
  } else {
    return null // other tokens are not shown
  }

  const isSender = sender.toLowerCase() === me
  const isRecipient = recipient.toLowerCase() === me
  const direction: Payment['direction'] = isSender && isRecipient ? 'self' : isSender ? 'sent' : 'received'

  return {
    id: `${log.transactionHash}-${log.logIndex}`,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    sender,
    recipient,
    direction,
    rail,
    amountRaw,
    note: note ?? '',
    timestamp: Number(timestamp),
    status: 'confirmed',
  }
}

/** Shared "fully caught up" marker: one stable object, so repeated polls do not look like changes. */
const SYNCED: HistoryProgress = { scanned: 0n, head: 0n }

export function usePaymentHistory(account?: Address) {
  const client = usePublicClient({ chainId: CHAIN_ID })
  const key = account && ROUTER_ADDRESS ? `${ROUTER_ADDRESS.toLowerCase()}:${account.toLowerCase()}` : ''
  const [state, setState] = useState<HistoryState>(() => emptyState(key))
  const scanRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!client || !account || !ROUTER_ADDRESS) return

    const router = ROUTER_ADDRESS
    const me = account.toLowerCase()
    const storageKey = `trustora:history:${key}`
    const ctx = {
      cancelled: false,
      running: false,
      loadedCache: false,
      cursor: undefined as bigint | undefined,
      byId: new Map<string, Payment>(),
    }

    // Bails out (keeps the same state object) when nothing really changed, so idle polls cause no re-render.
    const patch = (partial: Partial<HistoryState>) =>
      setState((prev) => {
        const base = prev.key === key ? prev : emptyState(key)
        const changed = (Object.keys(partial) as (keyof HistoryState)[]).some((k) => base[k] !== partial[k])
        return changed ? { ...base, ...partial } : base
      })

    const persist = () => {
      if (ctx.cursor === undefined) return
      try {
        const cache: Cache = { lastBlock: ctx.cursor.toString(), items: [...ctx.byId.values()].map(serialize) }
        localStorage.setItem(storageKey, JSON.stringify(cache))
      } catch {
        // storage full or unavailable: history is simply rebuilt next time
      }
    }

    const loadCache = () => {
      ctx.loadedCache = true
      try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return
        const cache = JSON.parse(raw) as Cache
        ctx.cursor = BigInt(cache.lastBlock)
        for (const item of cache.items) ctx.byId.set(item.id, deserialize(item))
        patch({ payments: sortPayments([...ctx.byId.values()]) })
      } catch {
        localStorage.removeItem(storageKey)
      }
    }

    const scan = async () => {
      if (ctx.running || ctx.cancelled) return
      ctx.running = true
      try {
        if (!ctx.loadedCache) loadCache()
        const head = await client.getBlockNumber()
        if (ctx.cursor === undefined) {
          // First visit on this device: start from the prebuilt index instead of scanning the router's whole lifetime.
          const seeded = await loadStaticIndex(router)
          if (seeded && !ctx.cancelled) {
            for (const log of seeded.logs) {
              const payment = toPayment(log, me)
              if (payment) ctx.byId.set(payment.id, payment)
            }
            ctx.cursor = seeded.scannedTo
            patch({ payments: sortPayments([...ctx.byId.values()]) })
            persist()
          }
        }
        if (ctx.cursor === undefined) {
          const start = ROUTER_DEPLOY_BLOCK ?? (head > FALLBACK_LOOKBACK ? head - FALLBACK_LOOKBACK : 0n)
          ctx.cursor = start > 0n ? start - 1n : 0n
        }
        if (ctx.cursor >= head) {
          patch({ progress: SYNCED, error: null })
          return
        }
        // Only a real backlog shows a loading state; a quick catch-up poll stays silent.
        const backlog = head - ctx.cursor > 2_000n
        if (backlog) patch({ isLoading: true })
        await scanPaymentLogs(client, router, account, ctx.cursor + 1n, head, {
          cancelled: () => ctx.cancelled,
          onBatch: (logs, scannedTo) => {
            let added = false
            for (const log of logs) {
              const payment = toPayment(log, me)
              if (payment && !ctx.byId.has(payment.id)) {
                ctx.byId.set(payment.id, payment)
                added = true
              }
            }
            ctx.cursor = scannedTo
            const progress = head - scannedTo > 50n ? { scanned: scannedTo, head } : SYNCED
            // A new array only when a payment was actually added, so memoized views downstream stay put.
            if (added) patch({ payments: sortPayments([...ctx.byId.values()]), progress, error: null })
            else patch({ progress, error: null })
            if (added || backlog) persist()
          },
        })
      } catch {
        if (!ctx.cancelled) patch({ error: 'Could not reach the network to load activity. Retrying...' })
      } finally {
        ctx.running = false
        if (!ctx.cancelled) patch({ isLoading: false })
      }
    }

    scanRef.current = scan
    void scan()
    // Poll only while the tab is visible, and catch up the moment it comes back.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void scan()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void scan()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      ctx.cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [client, account, key])

  const refresh = useCallback(() => scanRef.current(), [])
  const view = state.key === key ? state : emptyState(key)

  return useMemo(
    () => ({ payments: view.payments, progress: view.progress, isLoading: view.isLoading, error: view.error, refresh }),
    [view.payments, view.progress, view.isLoading, view.error, refresh],
  )
}
