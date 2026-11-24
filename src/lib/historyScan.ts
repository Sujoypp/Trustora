import { getAbiItem, type Address, type PublicClient } from 'viem'
import { trustoraAbi } from '@/lib/trustora'

/**
 * What the real Arc Mainnet RPC allows (measured, not assumed):
 * - eth_getLogs ranges above 10,000 blocks are rejected, so ranges stay just under that;
 * - about 3 requests per second are sustained, and bursts get "rate limit exceeded".
 * History is therefore read with one paced request per range, and a finished range is never requested twice per session.
 */
const MAX_RANGE = 9_500n
const MIN_RANGE = 500n
/** Minimum gap between requests started by this app. */
const MIN_GAP_MS = 400
const RETRY_WAIT_MS = [1500, 3000, 5000, 8000, 12000]
/** A range with more events than this switches to wallet-filtered queries (two requests, small answers). */
const BUSY_RANGE_LOGS = 800

let rangeSize = MAX_RANGE
let filtered = false
let nextSlot = 0

export const paymentEvent = getAbiItem({ abi: trustoraAbi, name: 'PaymentSent' })

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Waits for the next free request slot so every caller together stays under the node's rate limit. */
async function slot() {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + MIN_GAP_MS
  if (at > now) await sleep(at - now)
}

const errorText = (error: unknown): string => {
  const e = error as { message?: string; details?: string; shortMessage?: string }
  return `${e.shortMessage ?? ''} ${e.details ?? ''} ${e.message ?? ''}`.toLowerCase()
}
const isRateLimit = (error: unknown) => /rate limit|exceeds defined limit|too many requests|429/.test(errorText(error))
const isRangeError = (error: unknown) => !isRateLimit(error) && /range|too large|exceed/.test(errorText(error))

async function request<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await slot()
    try {
      return await run()
    } catch (error) {
      const wait = RETRY_WAIT_MS[attempt]
      if (isRateLimit(error) && wait !== undefined) {
        // The node answers a burst with a short penalty window, so wait it out instead of hammering it.
        await sleep(wait + Math.floor(Math.random() * 400))
        continue
      }
      throw error
    }
  }
}

const allLogs = (client: PublicClient, router: Address, from: bigint, to: bigint) =>
  client.getLogs({ address: router, event: paymentEvent, fromBlock: from, toBlock: to })
export type PaymentLog = Awaited<ReturnType<typeof allLogs>>[number]

/** The parts of a PaymentSent log the app needs; a viem log or a row from the prebuilt index both fit. */
export interface RawPaymentLog {
  args: { sender?: Address; recipient?: Address; token?: Address; amount?: bigint; note?: string; timestamp?: bigint }
  transactionHash: `0x${string}` | null
  blockNumber: bigint | null
  logIndex: number | null
}

/** Finished ranges per router, shared by every wallet looked at in this session (a profile lookup reuses them). */
const rangeCache = new Map<string, PaymentLog[]>()

const involves = (log: PaymentLog, account: string) =>
  log.args.sender?.toLowerCase() === account || log.args.recipient?.toLowerCase() === account

async function fetchRange(client: PublicClient, router: Address, account: Address, from: bigint, to: bigint, final: boolean): Promise<PaymentLog[]> {
  const cacheKey = `${router}:${from}-${to}`
  const cached = rangeCache.get(cacheKey)
  if (cached) return cached.filter((l) => involves(l, account.toLowerCase()))

  if (!filtered) {
    const logs = await request(() => allLogs(client, router, from, to))
    if (logs.length > BUSY_RANGE_LOGS) filtered = true
    else if (final) rangeCache.set(cacheKey, logs)
    return logs.filter((l) => involves(l, account.toLowerCase()))
  }
  const [sent, received] = await Promise.all([
    request(() => client.getLogs({ address: router, event: paymentEvent, args: { sender: account }, fromBlock: from, toBlock: to })),
    request(() => client.getLogs({ address: router, event: paymentEvent, args: { recipient: account }, fromBlock: from, toBlock: to })),
  ])
  return [...sent, ...received]
}

export interface ScanHooks {
  cancelled: () => boolean
  /** Called after each range with its logs and the highest block now fully scanned. */
  onBatch: (logs: PaymentLog[], scannedTo: bigint) => void
}

/** Scans PaymentSent logs involving one wallet from `from` to `head`, one paced, range-limited request at a time. Throws on real errors. */
export async function scanPaymentLogs(client: PublicClient, router: Address, account: Address, from: bigint, head: bigint, hooks: ScanHooks): Promise<void> {
  let cursor = from
  while (cursor <= head && !hooks.cancelled()) {
    const end = cursor + rangeSize - 1n > head ? head : cursor + rangeSize - 1n
    try {
      // Only ranges that end well behind the chain head are cached; the newest blocks are always re-read.
      const logs = await fetchRange(client, router, account, cursor, end, head - end > 64n)
      if (hooks.cancelled()) return
      hooks.onBatch(logs, end)
      cursor = end + 1n
    } catch (error) {
      if (rangeSize > MIN_RANGE && isRangeError(error)) {
        rangeSize = rangeSize / 2n
        continue
      }
      throw error
    }
  }
}

/** Every PaymentSent log from `from` to `head`, paced and range-limited. Used to build the static history index. */
export async function scanAllPaymentLogs(client: PublicClient, router: Address, from: bigint, head: bigint, onRange?: (done: bigint) => void): Promise<PaymentLog[]> {
  const out: PaymentLog[] = []
  let cursor = from
  while (cursor <= head) {
    const end = cursor + rangeSize - 1n > head ? head : cursor + rangeSize - 1n
    try {
      out.push(...(await request(() => allLogs(client, router, cursor, end))))
      onRange?.(end)
      cursor = end + 1n
    } catch (error) {
      if (rangeSize > MIN_RANGE && isRangeError(error)) {
        rangeSize = rangeSize / 2n
        continue
      }
      throw error
    }
  }
  return out
}
