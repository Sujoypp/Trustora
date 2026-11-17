import { useEffect, useSyncExternalStore } from 'react'
import type { PublicClient } from 'viem'

export interface Reading {
  block: bigint
  /** Round trip to the RPC node in milliseconds. */
  ms: number
}

// One shared poll (every 3 seconds) feeds every widget that shows live network numbers,
// and it only runs while at least one of them is on screen.
let client: PublicClient | undefined
let snapshot: { reading: Reading | null } = { reading: null }
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

async function probe() {
  if (!client) return
  const start = performance.now()
  try {
    const block = await client.getBlockNumber()
    snapshot = { reading: { block, ms: Math.round(performance.now() - start) } }
  } catch {
    snapshot = { reading: null }
  }
  listeners.forEach((notify) => notify())
}

function subscribe(notify: () => void) {
  listeners.add(notify)
  if (!timer) {
    void probe()
    timer = setInterval(() => void probe(), 3000)
  }
  return () => {
    listeners.delete(notify)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/** Latest block height and node round-trip time, shared by every caller. */
export function useNetworkReading(rpc: PublicClient | undefined): Reading | null {
  useEffect(() => {
    client = rpc
    if (rpc && listeners.size > 0) void probe()
  }, [rpc])
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot).reading
}
