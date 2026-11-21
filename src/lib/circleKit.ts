import { numberToHex, type Chain, type EIP1193Provider } from 'viem'
import { arbitrum, avalanche, base, mainnet, optimism, polygon } from 'viem/chains'
import { arcMainnet } from '@/config'

/**
 * Loads Circle's App Kit only when a swap or bridge screen needs it (it is large), and builds a wallet
 * adapter from the connected browser wallet. No keys are involved: the wallet signs everything.
 */
export const BRIDGE_CHAINS = [
  { kit: 'Arc', label: 'Arc Mainnet', chain: arcMainnet },
  { kit: 'Ethereum', label: 'Ethereum', chain: mainnet },
  { kit: 'Base', label: 'Base', chain: base },
  { kit: 'Arbitrum', label: 'Arbitrum', chain: arbitrum },
  { kit: 'Optimism', label: 'Optimism', chain: optimism },
  { kit: 'Polygon', label: 'Polygon', chain: polygon },
  { kit: 'Avalanche', label: 'Avalanche', chain: avalanche },
] as const

export type BridgeChainName = (typeof BRIDGE_CHAINS)[number]['kit']

let kitPromise: Promise<import('@circle-fin/app-kit').AppKit> | undefined
export function getKit() {
  kitPromise ??= import('@circle-fin/app-kit').then((m) => new m.AppKit())
  return kitPromise
}

const isUnrecognizedChain = (error: unknown) => {
  const e = error as { code?: number; data?: { originalError?: { code?: number } } }
  return e?.code === 4902 || e?.data?.originalError?.code === 4902
}

/** A wallet that lacks a chain rejects the switch with 4902: add the chain and retry. */
export function withAddChainFallback(provider: EIP1193Provider, chains: readonly Chain[]): EIP1193Provider {
  const send = provider.request.bind(provider) as (args: { method: string; params?: unknown }) => Promise<unknown>
  const request = (async (args: { method: string; params?: unknown }) => {
    try {
      return await send(args)
    } catch (error) {
      if (args.method !== 'wallet_switchEthereumChain' || !isUnrecognizedChain(error)) throw error
      const [{ chainId }] = args.params as [{ chainId: string }]
      const chain = chains.find((c) => c.id === Number(chainId))
      if (!chain) throw error
      await send({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: numberToHex(chain.id),
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [...chain.rpcUrls.default.http],
            blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
          },
        ],
      })
      return send(args)
    }
  }) as EIP1193Provider['request']

  return new Proxy(provider, {
    get(target, prop) {
      if (prop === 'request') return request
      const value: unknown = Reflect.get(target, prop, target)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
}

/** Switches the wallet to `chain` (adding it first if the wallet lacks it) and returns an adapter for it. */
export async function createWalletAdapter(connector: { getProvider(): Promise<unknown> }, switchTo?: Chain) {
  const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2')
  const raw = (await connector.getProvider()) as EIP1193Provider
  const provider = withAddChainFallback(
    raw,
    BRIDGE_CHAINS.map((c) => c.chain),
  )
  if (switchTo) {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(switchTo.id) }] })
  }
  return createViemAdapterFromProvider({ provider })
}
