import type { Payment, ReceiptData } from '@/lib/trustora'

/** Builds the digital receipt for a confirmed payment already in the history. */
export function paymentToReceipt(p: Payment): ReceiptData {
  return {
    txHash: p.txHash,
    blockNumber: p.blockNumber,
    sender: p.sender,
    recipient: p.recipient,
    rail: p.rail,
    amountRaw: p.amountRaw,
    note: p.note,
    timestamp: p.timestamp,
  }
}
