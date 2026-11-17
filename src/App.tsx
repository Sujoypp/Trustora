import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useAccount, useGasPrice } from 'wagmi'
import type { Hex } from 'viem'
import { toast } from 'sonner'
import { Background } from '@/components/Background'
import { AppFooter } from '@/components/AppFooter'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Header } from '@/components/Header'
import { ProductionBanner } from '@/components/ProductionBanner'
import { Sidebar } from '@/components/Sidebar'
import { ReceiptModal } from '@/components/ReceiptModal'
import { DashboardPage } from '@/pages/DashboardPage'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { usePaymentHistory } from '@/hooks/usePaymentHistory'
import { AppContext, type AppData } from '@/lib/appContext'
import { parsePaymentRequest } from '@/lib/paymentLink'
import { usePrefs } from '@/lib/prefs'
import {
  loadContract,
  loadExchange,
  loadHistory,
  loadSettings,
  loadVault,
  prefetchAllRoutes,
} from '@/lib/prefetch'
import { navigate, useRoute } from '@/lib/router'
import { matchRoute } from '@/lib/routes'
import { CHAIN_ID, ROUTER_ADDRESS, type Payment, type ReceiptData } from '@/lib/trustora'

// Only the Dashboard ships in the first bundle; every other screen is preloaded while the browser is idle.
const ExchangePage = lazy(loadExchange)
const ContractPage = lazy(loadContract)
const HistoryPage = lazy(loadHistory)
const SettingsPage = lazy(loadSettings)
const SecurityVaultPage = lazy(loadVault)

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <span className="orbit size-8 rounded-full border-2" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      <span className="sr-only">Loading</span>
    </div>
  )
}

const PAGES: Record<string, () => ReactElement> = {
  '/': () => <DashboardPage />,
  '/send': () => <ExchangePage />,
  '/receive': () => <ExchangePage />,
  '/contract': () => <ContractPage />,
  '/vault': () => <SecurityVaultPage />,
  '/history': () => <HistoryPage />,
  '/settings': () => <SettingsPage />,
}

export default function App() {
  const { address, isConnected } = useAccount()
  const { balance, isLoading: balanceLoading, refetch } = useUsdcBalance(address)
  const history = usePaymentHistory(address)
  const [prefs, setPrefs] = usePrefs()
  const { data: gasPrice } = useGasPrice({ chainId: CHAIN_ID, query: { refetchInterval: 15_000 } })
  const [pending, setPending] = useState<Payment[]>([])
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const route = useRoute()
  const def = matchRoute(route.path)

  // A shared payment link opens at "/" with its details in the query: take the visitor to the send form.
  useEffect(() => {
    if (route.path === '/' && parsePaymentRequest(route.search)) {
      navigate(`/send${route.search}`, { replace: true })
    } else if (!def) {
      navigate('/', { replace: true })
    }
  }, [route.path, route.search, def])

  useEffect(() => {
    prefetchAllRoutes()
  }, [])

  // Tell people when their connection drops instead of letting requests fail silently.
  useEffect(() => {
    const offline = () => toast.error('You are offline', { description: 'Payments and balances pause until your connection returns.', id: 'offline', duration: Infinity })
    const online = () => {
      toast.dismiss('offline')
      toast.success('Back online', { id: 'online' })
    }
    if (!navigator.onLine) offline()
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
    }
  }, [])

  const onPending = useCallback((payment: Payment) => setPending((list) => [payment, ...list]), [])
  const onSettled = useCallback((txHash: Hex) => {
    // Keep the row until the confirmed log replaces it; the feed hides a pending row once its hash is confirmed.
    setTimeout(() => setPending((list) => list.filter((p) => p.txHash !== txHash)), 15_000)
  }, [])
  const { refresh } = history
  const onSuccess = useCallback(
    (data: ReceiptData) => {
      setReceipt(data)
      void refetch()
      void refresh()
    },
    [refetch, refresh],
  )

  const remaining = history.progress ? history.progress.head - history.progress.scanned : 0n
  const syncLabel =
    !isConnected || !ROUTER_ADDRESS ? 'Idle' : history.error ? 'Retrying' : remaining > 50n ? 'Syncing' : 'Live'

  const refreshBalance = useCallback(() => {
    void refetch()
  }, [refetch])

  // Memoized so a page only re-renders when something it reads actually changed.
  const data: AppData = useMemo(
    () => ({
      address,
      isConnected,
      balance,
      balanceLoading,
      history,
      pending,
      onPending,
      onSettled,
      onSuccess,
      openReceipt: setReceipt,
      refreshBalance,
      prefs,
      setPrefs,
      gasPrice,
      syncLabel,
    }),
    [address, isConnected, balance, balanceLoading, history, pending, onPending, onSettled, onSuccess, refreshBalance, prefs, setPrefs, gasPrice, syncLabel],
  )

  const pageKey = `${route.path === '/receive' ? '/send' : route.path}:${route.idx}`
  const page = (PAGES[route.path] ?? PAGES['/'])()

  return (
    <AppContext.Provider value={data}>
      <div className="min-h-dvh">
        <Background />
        <div className="relative z-10">
        <Header />
        <Sidebar />

        <main className="mx-auto max-w-[1280px] px-4 pb-24 pt-20 sm:px-6 md:pb-12 md:pl-[92px]">
          <ProductionBanner />
          <ErrorBoundary resetKey={pageKey}>
            <div key={pageKey} className="anim-enter">
              <Suspense fallback={<PageFallback />}>{page}</Suspense>
            </div>
          </ErrorBoundary>
          <AppFooter />
        </main>

        <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
        </div>
      </div>
    </AppContext.Provider>
  )
}
