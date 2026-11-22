import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, ExternalLink } from 'lucide-react'
import { SuccessMark } from '@/components/states'
import { BackButton } from '@/components/PageHeader'
import { TxLink } from '@/components/TxLink'
import { toast } from 'sonner'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { CHAIN_ID, type ReceiptData, NETWORK_NAME } from '@/lib/trustora'
import { formatUsdc, fullDate, shortAddress } from '@/lib/format'

interface Props {
  receipt: ReceiptData | null
  onClose: () => void
}

export function ReceiptModal({ receipt, onClose }: Props) {
  const closeRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!receipt) return
    closeRef.current?.querySelector('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [receipt, onClose])

  const copyHash = async () => {
    if (!receipt) return
    try {
      await navigator.clipboard.writeText(receipt.txHash)
      setCopied(true)
      toast.success('Transaction hash copied')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy the hash.')
    }
  }

  const download = () => {
    if (!receipt) return
    const lines = [
      'TRUSTORA PAYMENT RECEIPT',
      '------------------------',
      `Status:      Confirmed`,
      `Network:     ${NETWORK_NAME}`,
      `Amount:      ${formatUsdc(receipt.amountRaw, 6)} USDC`,
      `From:        ${receipt.sender}`,
      `To:          ${receipt.recipient}`,
      `Note:        ${receipt.note || '-'}`,
      `Network fee: ${receipt.feeUsdc !== undefined ? `${formatUsdc(receipt.feeUsdc, 6)} USDC` : '-'}`,
      `Block:       ${receipt.blockNumber.toString()}`,
      `Time:        ${fullDate(receipt.timestamp)}`,
      `Tx hash:     ${receipt.txHash}`,
      `Explorer:    ${buildTxExplorerUrl(CHAIN_ID, receipt.txHash)}`,
    ]
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `trustora-receipt-${receipt.txHash.slice(2, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!receipt) return null

  return (
    <div className="anim-enter fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
        className="glass slide-in relative h-full w-full max-w-md overflow-y-auto"
        style={{ borderRadius: '16px 0 0 16px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={closeRef} className="px-5 pt-5">
          <BackButton onClick={onClose} />
        </div>

        <div className="px-5 pb-5 pt-5">
          <div className="flex flex-col items-center text-center">
            <SuccessMark className="size-16" />
            <h2 id="receipt-title" className="mt-3 text-base font-semibold">
              Payment confirmed
            </h2>
            <p className="display mt-1 text-4xl font-semibold tabular-nums">
              {formatUsdc(receipt.amountRaw, 2)} <span className="text-lg font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
            </p>
          </div>

          <ol className="mt-4 flex items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium" style={{ color: 'var(--emerald)' }} aria-label="Transaction steps, all complete">
            {['Signed', 'Broadcast', `Confirmed on ${NETWORK_NAME}`].map((step) => (
              <li key={step} className="flex items-center gap-1">
                <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                {step}
              </li>
            ))}
          </ol>

          <dl className="glass-inner mt-4 space-y-2.5 p-4 text-sm">
            <Row label="To" value={<span className="mono">{shortAddress(receipt.recipient)}</span>} />
            <Row label="From" value={<span className="mono">{shortAddress(receipt.sender)}</span>} />
            <Row label="Network" value={NETWORK_NAME} />
            {receipt.note && <Row label="Note" value={<span className="line-clamp-2 text-right">{receipt.note}</span>} />}
            {receipt.feeUsdc !== undefined && <Row label="Network fee" value={`${formatUsdc(receipt.feeUsdc, 4)} USDC`} />}
            <Row label="Block" value={receipt.blockNumber.toString()} />
            <Row label="Time" value={fullDate(receipt.timestamp)} />
          </dl>

          <div className="mt-3">
            <p className="eyebrow mb-1.5">TxID</p>
            <div className="glass-inner flex items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <TxLink hash={receipt.txHash} full />
              </div>
              <button
                type="button"
                onClick={() => void copyHash()}
                aria-label="Copy transaction hash"
                className="ghost-btn flex size-8 shrink-0 items-center justify-center border"
                style={{ borderColor: 'var(--border)' }}
              >
                {copied ? <Check className="size-4" style={{ color: 'var(--emerald)' }} /> : <Copy className="size-4" />}
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={download}
              className="ghost-btn flex min-h-10 items-center justify-center gap-2 border text-sm font-medium"
              style={{ borderColor: 'var(--border)' }}
            >
              <Download className="size-4" aria-hidden="true" />
              Download
            </button>
            <a
              href={buildTxExplorerUrl(CHAIN_ID, receipt.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="cta flex min-h-10 items-center justify-center gap-2 text-sm font-semibold"
            >
              Explorer
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt style={{ color: 'var(--subtle)' }}>{label}</dt>
      <dd className="text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>
        {value}
      </dd>
    </div>
  )
}
