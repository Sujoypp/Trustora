import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@/lib/appContext'
import { useLocalStore } from '@/lib/localStore'
import { deriveNotifications, type AppNotification } from '@/lib/notifications'
import { useEscrowDeals, useInvoices, useSchedules } from '@/hooks/useTrustoraData'
import { useNow } from '@/hooks/useNow'

const parseIds = (raw: string): string[] => {
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const parseBool = (raw: string): boolean => raw === 'true'
const NO_IDS: string[] = []
const MAX_READ = 400

/**
 * In-app notifications built from your real payments, escrow deals, invoices and schedules. Browser alerts are optional and
 * only appear while TRUSTORA is open in a tab; true background push needs a server and is not included.
 */
export function useNotifications() {
  const { address, history } = useApp()
  const now = useNow(60_000)
  const deals = useEscrowDeals(address).data
  const invoices = useInvoices(address).data
  const schedules = useSchedules(address).data
  const [readIds, setReadIds] = useLocalStore(address ? `trustora:notif-read:${address.toLowerCase()}` : null, parseIds, NO_IDS)
  const [browserOn, setBrowserOn] = useLocalStore('trustora:notif-browser', parseBool, false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
  const [startedAt] = useState(() => Math.floor(Date.now() / 1000))
  const alerted = useRef(new Set<string>())

  const items = useMemo<AppNotification[]>(
    () => deriveNotifications({ me: address, payments: history.payments, deals: deals ?? [], invoices: invoices ?? [], schedules: schedules ?? [], now }),
    [address, history.payments, deals, invoices, schedules, now],
  )
  const read = useMemo(() => new Set(readIds), [readIds])
  const unread = items.filter((i) => !read.has(i.id))

  const markRead = useCallback((ids: string[]) => setReadIds([...new Set([...readIds, ...ids])].slice(-MAX_READ)), [readIds, setReadIds])
  const markAllRead = useCallback(() => markRead(items.map((i) => i.id)), [items, markRead])

  const enableBrowser = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setPermission(result)
    setBrowserOn(result === 'granted')
  }, [setBrowserOn])
  const disableBrowser = useCallback(() => setBrowserOn(false), [setBrowserOn])

  // Browser alerts: only for things that happened since this session started, only when the tab is in the background.
  useEffect(() => {
    if (!browserOn || permission !== 'granted' || typeof document === 'undefined' || document.visibilityState !== 'hidden') return
    for (const item of unread) {
      if (alerted.current.has(item.id) || (item.at ?? 0) < startedAt - 30) continue
      alerted.current.add(item.id)
      new Notification(item.title, { body: item.detail, tag: item.id })
    }
  }, [unread, browserOn, permission, startedAt])

  return { items, unread, read, markRead, markAllRead, browserOn: browserOn && permission === 'granted', permission, enableBrowser, disableBrowser }
}
