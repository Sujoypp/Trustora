import type { Address } from 'viem'
import type { RawPaymentLog } from '@/lib/historyScan'
import { CHAIN_ID, ROUTER_DEPLOY_BLOCK } from '@/lib/trustora'

/** File written by `bun run index:router` and shipped with the site: every PaymentSent event up to `scannedTo`. */
interface IndexFile {
  chainId: number
  router: string
  fromBlock: string
  scannedTo: string
  events: { txHash: `0x${string}`; blockNumber: string; logIndex: number; sender: Address; recipient: Address; token: Address; amount: string; note: string; timestamp: string }[]
}

export interface SeededHistory {
  logs: RawPaymentLog[]
  scannedTo: bigint
}

let pending: Promise<IndexFile | null> | undefined

function fetchIndex(): Promise<IndexFile | null> {
  pending ??= fetch('/router-index.json', { cache: 'no-cache' })
    .then((res) => (res.ok ? (res.json() as Promise<IndexFile>) : null))
    .catch(() => null)
  return pending
}

/**
 * The prebuilt index, only if it is for this chain and router and starts at or before the configured deployment block.
 * Anything else (missing, stale config, wrong router) returns null and the app scans the chain itself.
 */
export async function loadStaticIndex(router: Address): Promise<SeededHistory | null> {
  const file = await fetchIndex()
  if (!file || file.chainId !== CHAIN_ID || file.router.toLowerCase() !== router.toLowerCase()) return null
  if (ROUTER_DEPLOY_BLOCK === undefined || BigInt(file.fromBlock) > ROUTER_DEPLOY_BLOCK) return null
  return {
    scannedTo: BigInt(file.scannedTo),
    logs: file.events.map((e) => ({
      args: { sender: e.sender, recipient: e.recipient, token: e.token, amount: BigInt(e.amount), note: e.note, timestamp: BigInt(e.timestamp) },
      transactionHash: e.txHash,
      blockNumber: BigInt(e.blockNumber),
      logIndex: e.logIndex,
    })),
  }
}
