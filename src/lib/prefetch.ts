import type { ComponentType } from 'react'

type Loader = () => Promise<{ default: ComponentType }>

// One loader per screen. The app lazy-loads with these same functions, so a prefetch fills the
// module cache and opening the screen later is instant.
export const loadExchange: Loader = () => import('@/pages/ExchangePage').then((m) => ({ default: m.ExchangePage }))
export const loadContract: Loader = () => import('@/pages/ContractPage').then((m) => ({ default: m.ContractPage }))
export const loadHistory: Loader = () => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage }))
export const loadVault: Loader = () => import('@/pages/SecurityVaultPage').then((m) => ({ default: m.SecurityVaultPage }))
export const loadSettings: Loader = () => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))

const ROUTE_LOADERS: Record<string, Loader> = {
  '/send': loadExchange,
  '/receive': loadExchange,
  '/contract': loadContract,
  '/history': loadHistory,
  '/vault': loadVault,
  '/settings': loadSettings,
}

/** Starts loading one screen's code (safe to call repeatedly). */
export function prefetchRoute(path: string): void {
  void ROUTE_LOADERS[path]?.().catch(() => undefined)
}

/** Loads every screen while the browser is idle, so no navigation ever waits on the network. */
export function prefetchAllRoutes(): void {
  const run = () => {
    for (const path of Object.keys(ROUTE_LOADERS)) prefetchRoute(path)
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2500 })
  else setTimeout(run, 800)
}
