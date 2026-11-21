import { useEffect } from 'react'
import { BackButton } from '@/components/PageHeader'
import { ReceivePanel } from '@/components/ReceivePanel'
import { UsdcCctpBadge } from '@/components/UsdcCctpBadge'
import { useApp } from '@/lib/appContext'

interface Props {
  onClose: () => void
}

/** Receive USDC: your address as a QR code, a copy button and shareable payment links, in a modal. */
export function ReceiveModal({ onClose }: Props) {
  const { address } = useApp()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="anim-enter fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receive-title"
        className="glass pop-in relative max-h-[92dvh] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <BackButton onClick={onClose} />
        <h2 id="receive-title" className="mt-4 text-lg font-semibold">
          Receive USDC
        </h2>
        <p className="mb-4 mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Share your address as a QR code or send a payment link.
        </p>
        <UsdcCctpBadge />
        <ReceivePanel address={address} />
      </div>
    </div>
  )
}
