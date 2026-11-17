/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { requireChain } from './onchain-facts'

const mainnetFacts = requireChain(5042)

/** Arc Mainnet, built from the onchain facts registry (viem does not ship it yet). */
export const arcMainnet = defineChain({
  id: 5042,
  name: mainnetFacts.name,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [mainnetFacts.rpcUrls[0]] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: mainnetFacts.explorerBase } },
})

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcMainnet.id, mainnetFacts.rpcUrls[0])

export const config = createConfig({
  chains: [arcMainnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcMainnet.id]: http(mainnetFacts.rpcUrls[0]),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
