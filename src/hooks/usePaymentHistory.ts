import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { getAbiItem, zeroAddress, type Address, type Hex } from 'viem'
import { Amount, gasTokenToUsdc } from '@/onchain-money'
import { requireChain } from '@/onchain-facts'
import {
  CHAIN_ID,
  ROUTER_ADDRESS,
  ROUTER_DEPLOY_BLOCK,
  USDC_ADDRESS,
  trustoraAbi,
  type Payment,
} from '@/lib/trustora'

const CHUNK = 5000n
/** Used only when the deployment block is not configured: recent activity, never block 0. */
const FALLBACK_LOOKBACK = 5000n
const POLL_MS = 4000

const paymentEvent = getAbiItem({ abi: trustoraAbi, name: 'PaymentSent' })

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

interface RawLog {
  args: { sender?: Address; recipient?: Address; token?: Address; amount?: bigint; note?: string; timestamp?: bigint }
  transactionHash: Hex | null
  blockNumber: bigint | null
  logIndex: number | null
}

function toPayment(log: RawLog, me: string): Payment | null {
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
          const start = ROUTER_DEPLOY_BLOCK ?? (head > FALLBACK_LOOKBACK ? head - FALLBACK_LOOKBACK : 0n)
          ctx.cursor = start > 0n ? start - 1n : 0n
        }
        if (ctx.cursor >= head) {
          patch({ progress: SYNCED, error: null })
          return
        }
        // Only a real backlog shows a loading state; a quick catch-up poll stays silent.
        const backlog = head - ctx.cursor > CHUNK / 4n
        if (backlog) patch({ isLoading: true })
        let from = ctx.cursor + 1n
        while (from <= head && !ctx.cancelled) {
          const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n
          const [sent, received] = await Promise.all([
            client.getLogs({ address: router, event: paymentEvent, args: { sender: account }, fromBlock: from, toBlock: to }),
            client.getLogs({ address: router, event: paymentEvent, args: { recipient: account }, fromBlock: from, toBlock: to }),
          ])
          if (ctx.cancelled) return
          let added = false
          for (const log of [...sent, ...received]) {
            const payment = toPayment(log, me)
            if (payment && !ctx.byId.has(payment.id)) {
              ctx.byId.set(payment.id, payment)
              added = true
            }
          }
          ctx.cursor = to
          from = to + 1n
          const progress = head - to > 50n ? { scanned: to, head } : SYNCED
          // A new array only when a payment was actually added, so memoized views downstream stay put.
          if (added) patch({ payments: sortPayments([...ctx.byId.values()]), progress, error: null })
          else patch({ progress, error: null })
          if (added || backlog) persist()
        }
      } catch {
        if (!ctx.cancelled) patch({ error: 'Could not reach the network to load activity. Retrying...' })
      } finally {
        ctx.running = false
        if (!ctx.cancelled) patch({ isLoading: false })
      }
    }

    scanRef.current = scan
    void scan()
    const timer = setInterval(() => void scan(), POLL_MS)
    return () => {
      ctx.cancelled = true
      clearInterval(timer)
    }
  }, [client, account, key])

  const refresh = useCallback(() => scanRef.current(), [])
  const view = state.key === key ? state : emptyState(key)

  return useMemo(
    () => ({ payments: view.payments, progress: view.progress, isLoading: view.isLoading, error: view.error, refresh }),
    [view.payments, view.progress, view.isLoading, view.error, refresh],
  )
}
