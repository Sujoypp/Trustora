import { getAddress, isAddress, type Address } from 'viem'

/**
 * The extra Trustora contracts. Each is deployed by you (Arc Studio never deploys to mainnet) and set through an
 * environment variable. Until an address is set, the matching screens say so and keep their buttons disabled.
 */
function readAddress(value: unknown): Address | undefined {
  return typeof value === 'string' && isAddress(value) ? getAddress(value) : undefined
}

export const ESCROW_ADDRESS = readAddress(import.meta.env.VITE_TRUSTORA_ESCROW_ADDRESS_MAINNET)
export const FLOWS_ADDRESS = readAddress(import.meta.env.VITE_TRUSTORA_FLOWS_ADDRESS_MAINNET)

export const ESCROW_ENV = 'VITE_TRUSTORA_ESCROW_ADDRESS_MAINNET'
export const FLOWS_ENV = 'VITE_TRUSTORA_FLOWS_ADDRESS_MAINNET'

export { escrowAbi } from '@/lib/abi/escrow'
export { flowsAbi } from '@/lib/abi/flows'

/** Contract state values, mirroring the Solidity enums. */
export const MilestoneState = { Funded: 0, Delivered: 1, Disputed: 2, Released: 3, Refunded: 4, Unclaimed: 5 } as const
export const InvoiceStatus = { Open: 0, Paid: 1, Cancelled: 2 } as const

export const DISPUTE_TIMEOUT_SECONDS = 30 * 86_400
export const RECOVERY_DELAY_SECONDS = 180 * 86_400
