import type { ComponentType } from 'react'

type Loader = () => Promise<{ default: ComponentType }>

// One loader per screen. The app lazy-loads with these same functions, so a prefetch fills the
// module cache and opening the screen later is instant.
export const loadExchange: Loader = () => import('@/pages/ExchangePage').then((m) => ({ default: m.ExchangePage }))
export const loadSwap: Loader = () => import('@/pages/SwapPage').then((m) => ({ default: m.SwapPage }))
export const loadBridge: Loader = () => import('@/pages/BridgePage').then((m) => ({ default: m.BridgePage }))
export const loadEscrow: Loader = () => import('@/pages/EscrowPage').then((m) => ({ default: m.EscrowPage }))
export const loadInvoices: Loader = () => import('@/pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage }))
export const loadLinks: Loader = () => import('@/pages/LinksPage').then((m) => ({ default: m.LinksPage }))
export const loadSplit: Loader = () => import('@/pages/SplitPage').then((m) => ({ default: m.SplitPage }))
export const loadRecurring: Loader = () => import('@/pages/RecurringPage').then((m) => ({ default: m.RecurringPage }))
export const loadProof: Loader = () => import('@/pages/ProofPage').then((m) => ({ default: m.ProofPage }))
export const loadAnalytics: Loader = () => import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
export const loadInsights: Loader = () => import('@/pages/InsightsPage').then((m) => ({ default: m.InsightsPage }))
export const loadProfile: Loader = () => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
export const loadContract: Loader = () => import('@/pages/ContractPage').then((m) => ({ default: m.ContractPage }))
export const loadHistory: Loader = () => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage }))
export const loadVault: Loader = () => import('@/pages/SecurityVaultPage').then((m) => ({ default: m.SecurityVaultPage }))
export const loadSettings: Loader = () => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))

const ROUTE_LOADERS: Record<string, Loader> = {
  '/send': loadExchange,
  '/receive': loadExchange,
  '/swap': loadSwap,
  '/bridge': loadBridge,
  '/escrow': loadEscrow,
  '/invoices': loadInvoices,
  '/links': loadLinks,
  '/split': loadSplit,
  '/recurring': loadRecurring,
  '/proof': loadProof,
  '/analytics': loadAnalytics,
  '/insights': loadInsights,
  '/profile': loadProfile,
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
