import { getAddress, isAddress, parseAbi, type Address, type Hex } from 'viem'
import { getUsdc, requireChain } from '@/onchain-facts'

/** The app runs on Arc Mainnet only. */
export const CHAIN_ID = 5042
export const CHAIN = requireChain(CHAIN_ID)
/** Display name for the network (the registry calls it just "Arc"). */
export const NETWORK_NAME = 'Arc Mainnet'

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error(`USDC is missing for ${NETWORK_NAME} in the onchain facts`)

/** ERC-20 view of USDC (6 decimals). Same funds as the native gas balance. */
export const USDC_ADDRESS = getAddress(usdcFact.address)

// You deploy the contract from your own wallet, then set these two values. They are never filled in for you.
const rawRouter = import.meta.env.VITE_TRUSTORA_PAY_ADDRESS_MAINNET as string | undefined
const rawDeployBlock = import.meta.env.VITE_TRUSTORA_PAY_DEPLOY_BLOCK_MAINNET as string | undefined

/** Address of the deployed TrustoraPay router on Arc Mainnet; undefined until you deploy and configure it. */
export const ROUTER_ADDRESS: Address | undefined = rawRouter && isAddress(rawRouter) ? getAddress(rawRouter) : undefined

/** Block the router was deployed at; history scans start here. */
export const ROUTER_DEPLOY_BLOCK: bigint | undefined =
  rawDeployBlock && /^\d+$/.test(rawDeployBlock) ? BigInt(rawDeployBlock) : undefined

/** Note length limit enforced by the app (the contract itself does not cap notes). */
export const MAX_NOTE_BYTES = 280

export const trustoraAbi = parseAbi([
  'function sendNative(address recipient, string note) payable',
  'function sendToken(address token, address recipient, uint256 amount, string note)',
  'function MAX_NOTE_BYTES() view returns (uint256)',
  'event PaymentSent(address indexed sender, address indexed recipient, address indexed token, uint256 amount, string note, uint256 timestamp)',
])

export type Rail = 'native' | 'erc20'
export type Direction = 'sent' | 'received' | 'self'

export interface Payment {
  id: string
  txHash: Hex
  blockNumber: bigint
  logIndex: number
  sender: Address
  recipient: Address
  direction: Direction
  rail: Rail
  /** Amount in the 6-decimal USDC view. */
  amountRaw: bigint
  note: string
  /** Unix seconds. */
  timestamp: number
  status: 'confirmed' | 'pending'
}

export interface ReceiptData {
  txHash: Hex
  blockNumber: bigint
  sender: Address
  recipient: Address
  rail: Rail
  amountRaw: bigint
  note: string
  timestamp: number
  feeUsdc?: bigint
}
