import { isAddress, type Address } from 'viem'
import { useLocalStore } from '@/lib/localStore'

/** Draft settings for the optional Multisig 2-of-2 Security Guard (preview). */
export interface Guard {
  enabled: boolean
  /** USDC amount at or above which the co-signer would need to approve. */
  threshold: number
  /** The second signer of the 2-of-2. Empty until set. */
  cosigner: string
}

export const DEFAULT_GUARD: Guard = { enabled: false, threshold: 1000, cosigner: '' }

const parseGuard = (raw: string): Guard => {
  try {
    const d = JSON.parse(raw) as Partial<Guard>
    return {
      enabled: d.enabled === true,
      threshold: typeof d.threshold === 'number' && d.threshold > 0 ? d.threshold : DEFAULT_GUARD.threshold,
      cosigner: typeof d.cosigner === 'string' ? d.cosigner : '',
    }
  } catch {
    return DEFAULT_GUARD
  }
}

/** The guard settings saved in this browser, one set per connected wallet. */
export function useGuard(owner?: Address): [Guard, (patch: Partial<Guard>) => void] {
  const [guard, setGuard] = useLocalStore(owner ? `trustora:guard:${owner.toLowerCase()}` : null, parseGuard, DEFAULT_GUARD)
  return [guard, (patch) => setGuard({ ...guard, ...patch })]
}

export const cosignerValid = (value: string) => isAddress(value.trim())
