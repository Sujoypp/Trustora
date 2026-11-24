/**
 * Read-only checks against the real Arc Mainnet. Nothing is signed or sent.
 * Run: bun run test:chain   (reads VITE_* values from .env)
 */
import { existsSync, readFileSync } from 'node:fs'
import { createPublicClient, erc20Abi, http, isAddress, type Address } from 'viem'
import { getUsdc, requireChain } from '../src/onchain-facts'
import { scanPaymentLogs } from '../src/lib/historyScan'
import { escrowAbi, flowsAbi } from '../src/lib/contracts'

const results: { name: string; ok: boolean; detail: string }[] = []
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const env = (name: string): Address | undefined => {
  const v = process.env[name]
  return v && isAddress(v) ? (v) : undefined
}

const chain = requireChain(5042)
let requests = 0
const client = createPublicClient({
  transport: http(chain.rpcUrls[0] ?? '', {
    retryCount: 1,
    retryDelay: 800,
    onFetchRequest: () => {
      requests += 1
    },
  }),
})
const usdcInfo = getUsdc(5042)
if (!usdcInfo) throw new Error('Circle USDC is missing from the registry for chain 5042')
const usdc = usdcInfo.address as Address

record('RPC reports chain id 5042', (await client.getChainId()) === 5042, chain.rpcUrls[0] ?? '')
const [symbol, decimals] = await Promise.all([
  client.readContract({ address: usdc, abi: erc20Abi, functionName: 'symbol' }),
  client.readContract({ address: usdc, abi: erc20Abi, functionName: 'decimals' }),
])
record('Circle USDC answers as USDC with 6 decimals', symbol === 'USDC' && decimals === 6, `${symbol} / ${decimals} at ${usdc}`)

const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'
const holders = [usdc, MULTICALL3, '0x000000000000000000000000000000000000dEaD' as Address]
const single = await Promise.all(holders.map((h) => client.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [h] })))
const multi = await client.multicall({ contracts: holders.map((h) => ({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [h] }) as const), allowFailure: false, multicallAddress: MULTICALL3 })
record('Multicall3 returns the same data as single reads', single.every((v, i) => v === multi[i]), `${holders.length} reads in one request`)

const router = env('VITE_TRUSTORA_PAY_ADDRESS_MAINNET')
const routerBlock = process.env.VITE_TRUSTORA_PAY_DEPLOY_BLOCK_MAINNET
if (router && routerBlock) {
  const code = await client.getCode({ address: router })
  record('Payment router has contract code', Boolean(code && code !== '0x'), router)
  const max = await client.readContract({ address: router, abi: [{ type: 'function', name: 'MAX_NOTE_BYTES', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const, functionName: 'MAX_NOTE_BYTES' })
  record('Payment router reports MAX_NOTE_BYTES = 280', max === 280n, String(max))

  await new Promise((r) => setTimeout(r, 4000)) // let the node's burst window pass after the checks above
  const head = await client.getBlockNumber()
  const before = requests
  const started = Date.now()
  let logs = 0
  // The tail a visitor scans after loading the prebuilt index: the last ~3 days of blocks at most.
  const tailFrom = head - 500_000n > BigInt(routerBlock) ? head - 500_000n : BigInt(routerBlock)
  await scanPaymentLogs(client, router, '0x000000000000000000000000000000000000dEaD', tailFrom, head, { cancelled: () => false, onBatch: (l) => (logs += l.length) })
  const ms = Date.now() - started
  record('Paced history scan completes without rate-limit failures', true, `${Number(head - tailFrom).toLocaleString()} blocks, ${requests - before} requests, ${ms} ms, ${logs} logs`)

  const file = existsSync('public/router-index.json') ? (JSON.parse(readFileSync('public/router-index.json', 'utf8')) as { chainId: number; router: string; scannedTo: string; events: unknown[] }) : null
  record('Prebuilt history index matches this chain and router', Boolean(file && file.chainId === 5042 && file.router.toLowerCase() === router.toLowerCase() && BigInt(file.scannedTo) <= head), file ? `${file.events.length} events up to block ${file.scannedTo}, ${(head - BigInt(file.scannedTo)).toLocaleString()} blocks behind` : 'run: bun run index:router')
} else {
  record('Payment router configured', false, 'VITE_TRUSTORA_PAY_ADDRESS_MAINNET / DEPLOY_BLOCK not set')
}

for (const [label, name, abi] of [['Escrow', 'VITE_TRUSTORA_ESCROW_ADDRESS_MAINNET', escrowAbi], ['Flows', 'VITE_TRUSTORA_FLOWS_ADDRESS_MAINNET', flowsAbi]] as const) {
  const address = env(name)
  if (!address) {
    console.log(`SKIP  ${label}: ${name} is not set, so it is not deployed or not configured`)
    continue
  }
  const code = await client.getCode({ address })
  const configured = await client.readContract({ address, abi, functionName: 'usdc' })
  record(`${label} contract is live and wired to Circle USDC`, Boolean(code && code !== '0x') && configured.toLowerCase() === usdc.toLowerCase(), address)
}

const failed = results.filter((r) => !r.ok)
console.log(failed.length === 0 ? `\nALL ${results.length} CHAIN CHECKS PASSED` : `\n${failed.length} CHAIN CHECK(S) FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
