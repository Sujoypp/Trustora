import { useCallback, useMemo, useSyncExternalStore } from 'react'

const EVENT = 'trustora:store'

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener(EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(EVENT, callback)
  }
}

/**
 * A localStorage-backed value that stays in sync across components and tabs.
 * `parse` and `empty` must be stable (module-level) references.
 */
export function useLocalStore<T>(key: string | null, parse: (raw: string) => T, empty: T): [T, (next: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? (localStorage.getItem(key) ?? '') : ''),
    () => '',
  )
  const value = useMemo(() => (raw ? parse(raw) : empty), [raw, parse, empty])

  const set = useCallback(
    (next: T) => {
      if (!key) return
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // storage full or unavailable: the change simply is not saved
      }
      window.dispatchEvent(new Event(EVENT))
    },
    [key],
  )

  return [value, set]
}
