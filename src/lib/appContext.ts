import { createContext, useContext } from 'react'
import type { Address, Hex } from 'viem'
import type { Amount } from '@/onchain-money'
import type { usePaymentHistory } from '@/hooks/usePaymentHistory'
import type { Prefs } from '@/lib/prefs'
import type { Payment, ReceiptData } from '@/lib/trustora'

/** Wallet, balance, history and preferences shared by every page. */
export interface AppData {
  address?: Address
  isConnected: boolean
  balance?: Amount
  balanceLoading: boolean
  history: ReturnType<typeof usePaymentHistory>
  pending: Payment[]
  onPending: (payment: Payment) => void
  onSettled: (txHash: Hex) => void
  onSuccess: (receipt: ReceiptData) => void
  /** Opens the digital receipt for a payment that already confirmed. */
  openReceipt: (receipt: ReceiptData) => void
  /** Re-reads the USDC balance right now instead of waiting for the next poll. */
  refreshBalance: () => void
  prefs: Prefs
  setPrefs: (patch: Partial<Prefs>) => void
  gasPrice?: bigint
  syncLabel: string
}

export const AppContext = createContext<AppData | null>(null)

export function useApp(): AppData {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside the app provider')
  return ctx
}
