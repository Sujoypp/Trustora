/**
 * Deploys TrustoraEscrow or TrustoraFlows to Arc Mainnet (chain 5042) from YOUR machine and wallet.
 *
 *   bun run deploy:escrow                 dry run: checks everything, sends nothing
 *   bun run deploy:escrow -- --broadcast  asks you to type a confirmation, then deploys for real
 *   bun run deploy:flows                  the same for TrustoraFlows
 *
 * Add `--write-env` to write the verified address into .env when the deployment succeeds.
 *
 * Safety rules built in:
 *   - the deployer key is read from DEPLOYER_PRIVATE_KEY only, never from a file, and is never printed or logged
 *   - nothing is sent without --broadcast AND an interactive confirmation typed in a terminal
 *   - the USDC address comes from the onchain registry and is verified onchain (USDC, 6 decimals) before use
 *   - the RPC must report chain 5042, and the compiled artifact must be newer than the Solidity source
 *   - after deploying, the contract is read back: code exists and usdc() equals the registry address
 * Optional: ARC_MAINNET_RPC_URL to use your own RPC provider instead of the public one (never commit it).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, erc20Abi, formatUnits, getAddress, http, isHex, type Abi, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { buildAddressExplorerUrl, buildTxExplorerUrl, getUsdc, requireChain } from '../src/onchain-facts'

const CHAIN_ID = 5042
const TARGETS = {
  escrow: { name: 'TrustoraEscrow', env: 'VITE_TRUSTORA_ESCROW_ADDRESS_MAINNET' },
  flows: { name: 'TrustoraFlows', env: 'VITE_TRUSTORA_FLOWS_ADDRESS_MAINNET' },
} as const

const fail = (message: string): never => {
  console.error(`\nStopped: ${message}\n`)
  process.exit(1)
}

const args = process.argv.slice(2)
const targetKey = args.find((a) => a === 'escrow' || a === 'flows')
if (!targetKey) fail('choose a contract: "escrow" or "flows" (for example: bun run deploy:escrow).')
const target = TARGETS[targetKey as keyof typeof TARGETS]
const broadcast = args.includes('--broadcast')
const writeEnv = args.includes('--write-env')

// 1. The compiled artifact must exist, expose exactly one constructor argument (the USDC address), and be fresh.
const sourcePath = `contracts/${target.name}.sol`
const artifactPath = `contracts/out/${target.name}.sol/${target.name}.json`
if (!existsSync(artifactPath)) fail(`no compiled artifact at ${artifactPath}. Run "forge build" first.`)
if (statSync(artifactPath).mtimeMs < statSync(sourcePath).mtimeMs) fail(`${artifactPath} is older than ${sourcePath}. Run "forge build" so you deploy the current source.`)
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as { abi: Abi; bytecode: { object: Hex } }
const ctor = artifact.abi.find((item) => item.type === 'constructor')
if (!ctor || ctor.type !== 'constructor' || ctor.inputs.length !== 1 || ctor.inputs[0].type !== 'address') fail('the constructor must take exactly one address argument (the USDC token).')
if (!isHex(artifact.bytecode.object) || artifact.bytecode.object.length < 100) fail('the artifact has no deployable bytecode.')

// 2. The network must really be Arc Mainnet, and the USDC address must be Circle's, read from the registry and checked onchain.
const registry = requireChain(CHAIN_ID)
const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) fail('the onchain registry has no USDC address for Arc Mainnet.')
const USDC = getAddress((usdcFact as { address: string }).address)
const rpcUrl = process.env.ARC_MAINNET_RPC_URL?.trim() || registry.rpcUrls[0]
const chain = defineChain({
  id: CHAIN_ID,
  name: 'Arc Mainnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
})
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
const reported = await publicClient.getChainId().catch(() => fail('the RPC did not answer. Check your connection or ARC_MAINNET_RPC_URL.'))
if (reported !== CHAIN_ID) fail(`the RPC reports chain ${reported}, not ${CHAIN_ID} (Arc Mainnet). Refusing to continue.`)
const usdcCode = await publicClient.getCode({ address: USDC })
if (!usdcCode || usdcCode === '0x') fail(`no contract exists at the USDC address ${USDC} on chain ${CHAIN_ID}.`)
const [symbol, decimals] = await Promise.all([publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'symbol' }), publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' })])
if (symbol !== 'USDC' || decimals !== 6) fail(`the token at ${USDC} reports ${symbol} with ${decimals} decimals, not USDC with 6.`)

// 3. The deployer: the key stays in memory only.
const rawKey = process.env.DEPLOYER_PRIVATE_KEY?.trim()
delete process.env.DEPLOYER_PRIVATE_KEY
if (!rawKey) fail('set DEPLOYER_PRIVATE_KEY in your terminal for this run only (it is never read from a file or printed).')
const key = (rawKey?.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) fail('DEPLOYER_PRIVATE_KEY must be 64 hexadecimal characters.')
const account = privateKeyToAccount(key)
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) })
const constructorArgs = encodeAbiParameters([{ type: 'address' }], [USDC])
const data = (artifact.bytecode.object + constructorArgs.slice(2)) as Hex

// 4. Cost estimate. On Arc the gas token is USDC with 18 decimals.
const [balance, gas, fees] = await Promise.all([
  publicClient.getBalance({ address: account.address }),
  publicClient.estimateGas({ account: account.address, data }).catch(() => fail('gas could not be estimated. The deployer may be unfunded, or the constructor would revert.')),
  publicClient.estimateFeesPerGas(),
])
const gasLimit = (gas * 12n) / 10n
const maxFee = fees.maxFeePerGas ?? fees.gasPrice ?? 0n
const cost = gasLimit * maxFee

console.log(`
TRUSTORA deployment plan
  Contract         ${target.name}  (${sourcePath})
  Network          Arc Mainnet, chain ${CHAIN_ID}
  RPC              ${rpcUrl.includes('?') ? rpcUrl.split('?')[0] + '?...' : rpcUrl}
  USDC (verified)  ${USDC}   symbol ${symbol}, ${decimals} decimals
  Constructor      ${target.name}(address _usdc = ${USDC})
  Deployer         ${account.address}
  Balance          ${formatUnits(balance, 18)} USDC
  Gas limit        ${gasLimit}
  Max fee          up to ${formatUnits(cost, 18)} USDC
`)
if (balance < cost) fail('the deployer balance is lower than the maximum fee. Fund it with USDC on Arc Mainnet first.')

if (!broadcast) {
  console.log('Dry run only. Nothing was sent. Run again with --broadcast to deploy for real.\n')
  process.exit(0)
}

// 5. Real deployment needs a person at a terminal typing the confirmation.
if (!process.stdin.isTTY) fail('deploying needs an interactive terminal so you can type the confirmation.')
console.log('WARNING: this sends a real transaction on Arc Mainnet. It spends real USDC for gas and cannot be undone.')
const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = await rl.question('Type DEPLOY TO MAINNET to continue: ')
rl.close()
if (answer.trim() !== 'DEPLOY TO MAINNET') fail('confirmation did not match. Nothing was sent.')

const hash = await wallet.sendTransaction({ data, gas: gasLimit })
console.log(`\nTransaction sent: ${buildTxExplorerUrl(CHAIN_ID, hash)}\nWaiting for confirmation...`)
const receipt = await publicClient.waitForTransactionReceipt({ hash })
if (receipt.status !== 'success' || !receipt.contractAddress) fail(`the deployment transaction failed: ${buildTxExplorerUrl(CHAIN_ID, hash)}`)
const deployed = getAddress(receipt.contractAddress as Address)

// 6. Read the contract back before trusting it.
const code = await publicClient.getCode({ address: deployed })
if (!code || code === '0x') fail(`no code was found at ${deployed} after deployment.`)
const configured = await publicClient.readContract({ address: deployed, abi: artifact.abi, functionName: 'usdc' })
if (String(configured).toLowerCase() !== USDC.toLowerCase()) fail(`the deployed contract reports usdc() = ${String(configured)}, which is not ${USDC}. Do not use it.`)

mkdirSync('contracts/deployments', { recursive: true })
const record = { contract: target.name, chainId: CHAIN_ID, address: deployed, usdc: USDC, deployer: account.address, txHash: hash, blockNumber: receipt.blockNumber.toString(), compiler: { solc: '0.8.28', optimizer: true, runs: 200, evmVersion: 'cancun' }, constructorArgs }
writeFileSync(`contracts/deployments/${target.name}.arc-mainnet.json`, JSON.stringify(record, null, 2) + '\n')

if (writeEnv) {
  const lines = existsSync('.env') ? readFileSync('.env', 'utf8').split('\n') : []
  const upsert = (name: string, value: string) => {
    const i = lines.findIndex((l) => l.startsWith(`${name}=`))
    if (i >= 0) lines[i] = `${name}=${value}`
    else lines.push(`${name}=${value}`)
  }
  upsert(target.env, deployed)
  writeFileSync('.env', lines.filter((l, i, all) => l !== '' || i === all.length - 1).join('\n').replace(/\n*$/, '\n'))
  console.log('\nWrote the address to .env. Restart the dev server to pick them up.')
}

console.log(`
Deployed and verified onchain.
  Address     ${deployed}
  Explorer    ${buildAddressExplorerUrl(CHAIN_ID, deployed)}
  Tx          ${buildTxExplorerUrl(CHAIN_ID, hash)}
  Block       ${receipt.blockNumber}

Final configuration (also add these to your hosting provider's environment, then rebuild):
  ${target.env}=${deployed}

To publish the source on the explorer ("Verify & publish"), use:
  Compiler        solc 0.8.28, optimizer enabled, 200 runs, EVM version cancun, license MIT
  Constructor     ${constructorArgs.slice(2)}
`)
