import { useCallback } from 'react'
import { useLocalStore } from '@/lib/localStore'

export interface Prefs {
  /** Replaces balances with dots across the app. */
  hideBalances: boolean
  /** Ask for an extra confirmation above this many USDC. 0 turns the warning off. */
  warnAbove: number
}

export const WARN_OPTIONS = [0, 100, 500, 1000, 10000] as const

const DEFAULT_PREFS: Prefs = { hideBalances: false, warnAbove: 1000 }

const parsePrefs = (raw: string): Prefs => {
  try {
    const data = JSON.parse(raw) as Partial<Prefs>
    return {
      hideBalances: data.hideBalances === true,
      warnAbove: typeof data.warnAbove === 'number' && data.warnAbove >= 0 ? data.warnAbove : DEFAULT_PREFS.warnAbove,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

/** Security preferences saved in this browser. */
export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useLocalStore('trustora:prefs', parsePrefs, DEFAULT_PREFS)
  const update = useCallback((patch: Partial<Prefs>) => setPrefs({ ...prefs, ...patch }), [prefs, setPrefs])
  return [prefs, update]
}

export const MASK = '\u2022\u2022\u2022\u2022\u2022'
