import { useCallback, useMemo } from 'react'
import type { Address } from 'viem'
import { useLocalStore } from '@/lib/localStore'
import type { Reminder } from '@/lib/ics'

const EMPTY: Reminder[] = []

const parse = (raw: string): Reminder[] => {
  try {
    const list = JSON.parse(raw) as Reminder[]
    return Array.isArray(list)
      ? list.filter((r) => typeof r.id === 'string' && typeof r.title === 'string' && typeof r.dueAt === 'number')
      : EMPTY
  } catch {
    return EMPTY
  }
}

export interface RemindersApi {
  reminders: Reminder[]
  add: (input: Omit<Reminder, 'id'>) => Reminder
  remove: (id: string) => void
}

/** Payment reminders saved in this browser, one list per connected wallet, soonest first. */
export function useReminders(owner?: Address): RemindersApi {
  const [reminders, setReminders] = useLocalStore(owner ? `trustora:reminders:${owner.toLowerCase()}` : null, parse, EMPTY)

  const add = useCallback(
    (input: Omit<Reminder, 'id'>): Reminder => {
      const reminder: Reminder = { ...input, id: `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` }
      setReminders([...reminders, reminder].sort((a, b) => a.dueAt - b.dueAt))
      return reminder
    },
    [reminders, setReminders],
  )

  const remove = useCallback((id: string) => setReminders(reminders.filter((r) => r.id !== id)), [reminders, setReminders])

  return useMemo(() => ({ reminders, add, remove }), [reminders, add, remove])
}
