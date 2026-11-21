import { useEffect, useState } from 'react'
import { getShareBase } from '@/lib/share'

/** The public base URL for links you hand to other people (resolved once; null until known). */
export function useShareBase(): string | null {
  const [base, setBase] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void getShareBase().then((value) => {
      if (!cancelled) setBase(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return base
}
