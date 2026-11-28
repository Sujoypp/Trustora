/**
 * Builds public/router-index.json: every PaymentSent event the payment router has emitted so far.
 * The app loads this file first, so a new visitor only scans the few blocks since it was built instead of
 * the router's whole lifetime. Run it before each deploy (and any time you like): `bun run index:router`.
 * Read-only: nothing is signed or sent.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createPublicClient, http, isAddress } from 'viem'
import { requireChain } from '../src/onchain-facts'
import { scanAllPaymentLogs } from '../src/lib/historyScan'

const router = process.env.VITE_TRUSTORA_PAY_ADDRESS_MAINNET
const fromBlock = process.env.VITE_TRUSTORA_PAY_DEPLOY_BLOCK_MAINNET
if (!router || !isAddress(router) || !fromBlock) {
  console.error('Set VITE_TRUSTORA_PAY_ADDRESS_MAINNET and VITE_TRUSTORA_PAY_DEPLOY_BLOCK_MAINNET in .env first.')
  process.exit(1)
}
const chain = requireChain(5042)
const client = createPublicClient({ transport: http(chain.rpcUrls[0] ?? '', { retryCount: 1, retryDelay: 900, timeout: 15_000 }) })
if ((await client.getChainId()) !== 5042) {
  console.error('The RPC is not Arc Mainnet (chain id 5042). Nothing was written.')
  process.exit(1)
}

const head = await client.getBlockNumber()
const started = Date.now()
const logs = await scanAllPaymentLogs(client, router, BigInt(fromBlock), head, (done) => {
  const pct = Number(((done - BigInt(fromBlock)) * 100n) / (head - BigInt(fromBlock) + 1n))
  process.stdout.write(`\rScanning ${pct}%`)
})

const events = logs.flatMap((l) => {
  const a = l.args
  if (!l.transactionHash || l.blockNumber === null || l.logIndex === null || !a.sender || !a.recipient || !a.token || a.amount === undefined || a.timestamp === undefined) return []
  return [{ txHash: l.transactionHash, blockNumber: l.blockNumber.toString(), logIndex: l.logIndex, sender: a.sender, recipient: a.recipient, token: a.token, amount: a.amount.toString(), note: a.note ?? '', timestamp: a.timestamp.toString() }]
})

mkdirSync('public', { recursive: true })
writeFileSync('public/router-index.json', JSON.stringify({ chainId: 5042, router, fromBlock, scannedTo: head.toString(), generatedAt: new Date().toISOString(), events }))
console.log(`\nWrote public/router-index.json: ${events.length} events up to block ${head} in ${Math.round((Date.now() - started) / 1000)}s`)
