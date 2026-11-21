import { useEffect, useState } from 'react'

/** Current time in unix seconds, refreshed on an interval so deadline-based buttons switch on by themselves. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
