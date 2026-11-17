import { getAddress, isAddress, type Address } from 'viem'
import { MAX_NOTE_BYTES } from '@/lib/trustora'
import { noteBytes } from '@/lib/format'

export interface PaymentRequest {
  to: Address
  amount: string
  note: string
}

/** Notes in links are kept short so the link and its QR code stay easy to scan. */
export const LINK_NOTE_MAX = 140

/** Query string for a payment link: neutral names only, nothing secret. */
export function buildPaymentQuery(to: string, amount: string, note: string): string {
  const params = new URLSearchParams({ to })
  if (amount && Number(amount) > 0) params.set('amt', amount)
  const trimmed = note.trim().slice(0, LINK_NOTE_MAX)
  if (trimmed) params.set('note', trimmed)
  return params.toString()
}

/** Reads and validates a payment request from a URL query string; null when absent or invalid. */
export function parsePaymentRequest(search: string): PaymentRequest | null {
  const params = new URLSearchParams(search)
  const to = params.get('to')
  if (!to || !isAddress(to)) return null
  const rawAmount = params.get('amt') ?? ''
  const amount = /^\d{1,12}(\.\d{1,6})?$/.test(rawAmount) && Number(rawAmount) > 0 ? rawAmount : ''
  let note = (params.get('note') ?? '').slice(0, LINK_NOTE_MAX)
  while (noteBytes(note) > MAX_NOTE_BYTES) note = note.slice(0, -1)
  return { to: getAddress(to), amount, note }
}
