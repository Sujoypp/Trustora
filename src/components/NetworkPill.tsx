import { usePublicClient } from 'wagmi'
import { formatGwei } from 'viem'
import { useApp } from '@/lib/appContext'
import { useNetworkReading } from '@/lib/networkReading'
import { CHAIN_ID, NETWORK_NAME } from '@/lib/trustora'

/** Live numbers for the active Arc network: tone, label parts and a tooltip. */
function useMetrics() {
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { gasPrice } = useApp()
  const reading = useNetworkReading(client)

  const fast = reading !== null && reading.ms < 1000
  const tone = reading === null ? 'var(--danger)' : fast ? 'var(--emerald)' : 'var(--amber)'
  const gwei = gasPrice !== undefined ? Number(formatGwei(gasPrice)) : null
  const gweiText = gwei === null ? null : `${gwei.toLocaleString(undefined, { maximumFractionDigits: gwei < 10 ? 2 : 0 })} gwei`
  const title = reading
    ? `${NETWORK_NAME} (chain ${CHAIN_ID}). Block ${reading.block.toString()}, node round trip ${reading.ms} ms${gweiText ? `, gas ${gweiText}` : ''}.`
    : `${NETWORK_NAME} is not responding right now.`
  return { reading, tone, gweiText, title }
}

/** Header status pill: pulsing dot and the network name. Live numbers are in the tooltip and the footer. */
export function NetworkPill() {
  const { tone, title } = useMetrics()

  return (
    <span
      className="flex min-h-9 items-center gap-2 rounded-full border px-2.5 text-xs font-medium sm:px-3"
      style={{ color: 'var(--ink-2)', borderColor: 'rgba(34,211,238,0.35)' }}
      title={title}
    >
      <span className="live-dot size-2 shrink-0 rounded-full" style={{ background: tone }} />
      <span className="hidden sm:inline">{NETWORK_NAME}</span>
      <span className="sr-only sm:hidden">{NETWORK_NAME}</span>
    </span>
  )
}

/** The same live numbers, always visible, for the footer. */
export function NetworkMetrics() {
  const { reading, tone, gweiText, title } = useMetrics()

  return (
    <span className="mono flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums" title={title}>
      <span className="flex items-center gap-2">
        <span className="live-dot size-2 shrink-0 rounded-full" style={{ background: tone }} />
        {NETWORK_NAME}
      </span>
      {reading ? (
        <>
          <span>Block #{reading.block.toLocaleString()}</span>
          <span style={{ color: tone }}>Latency {reading.ms} ms</span>
          <span>Gas {gweiText ?? '--'}</span>
        </>
      ) : (
        <span style={{ color: 'var(--danger)' }}>Not responding</span>
      )}
    </span>
  )
}
