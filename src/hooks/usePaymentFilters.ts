import { useCallback, useState } from 'react'
import { DEFAULT_FILTERS, type PaymentFilters } from '@/lib/paymentFilters'

export function usePaymentFilters() {
  const [filters, setFilters] = useState<PaymentFilters>(DEFAULT_FILTERS)
  const patch = useCallback((next: Partial<PaymentFilters>) => setFilters((f) => ({ ...f, ...next })), [])
  const reset = useCallback(() => setFilters(DEFAULT_FILTERS), [])
  return { filters, patch, reset }
}

export type PaymentFilterState = ReturnType<typeof usePaymentFilters>
