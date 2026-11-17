import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ConnectKitButton } from 'connectkit'
import { Check, Copy, Link2, Lock, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { getShareBase } from '@/lib/share'
import { buildPaymentQuery, LINK_NOTE_MAX } from '@/lib/paymentLink'
import { shortAddress } from '@/lib/format'

type QrMode = 'link' | 'address'

export function ReceivePanel({ address }: { address?: string }) {
  const [base, setBase] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [qrMode, setQrMode] = useState<QrMode>('link')
  const [copied, setCopied] = useState<'link' | 'address' | null>(null)

  // Resolve the shareable base once; copy, share and the QR code wait for it.
  useEffect(() => {
    let cancelled = false
    void getShareBase().then((b) => {
      if (!cancelled) setBase(b)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!address) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="shimmer size-40 rounded-2xl" />
        <p className="max-w-xs text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          Connect a wallet to create payment links and QR codes.
        </p>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button onClick={show} className="cta min-h-12 w-full rounded-full text-sm font-semibold">
              Connect wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    )
  }

  const link = base ? `${base}/?${buildPaymentQuery(address, amount, note)}` : null
  const qrValue = qrMode === 'link' ? link : address
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async (kind: 'link' | 'address') => {
    const value = kind === 'link' ? link : address
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      toast.success(kind === 'link' ? 'Payment link copied' : 'Address copied')
      setTimeout(() => setCopied(null), 1800)
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.')
    }
  }

  const share = async () => {
    if (!link) return
    try {
      await navigator.share({ title: 'Pay me on Trustora', text: 'Pay me with USDC on Arc', url: link })
    } catch {
      // dismissed or unsupported: the copy button still works
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        Create a link or QR code. Whoever opens it gets a payment form filled in for you.
      </p>

      <div className="glass-inner rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (/^\d{0,12}\.?\d{0,6}$/.test(v)) setAmount(v)
            }}
            placeholder="Any amount"
            aria-label="Requested amount in USDC (optional)"
            className="display w-full min-w-0 bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-700"
          />
          <span className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>
            USDC
          </span>
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
          Optional. Leave empty to let the sender choose.
        </p>
      </div>

      <div className="glass-inner flex items-center gap-2 rounded-2xl px-4 py-3">
        <Lock className="size-4 shrink-0" style={{ color: 'var(--accent)' }} />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, LINK_NOTE_MAX))}
          placeholder="What is this payment for? (optional)"
          aria-label="Payment note (optional)"
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600"
        />
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="glass-inner flex rounded-full p-1" role="tablist" aria-label="QR code content">
          {(['link', 'address'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={qrMode === m}
              onClick={() => setQrMode(m)}
              className="min-h-9 rounded-full px-4 text-xs font-semibold capitalize transition-colors"
              style={{
                background: qrMode === m ? 'rgba(99,102,241,0.25)' : 'transparent',
                color: qrMode === m ? 'var(--ink)' : 'var(--muted)',
              }}
            >
              {m === 'link' ? 'Payment link' : 'Address only'}
            </button>
          ))}
        </div>

        <div
          className="rounded-2xl p-3"
          style={{ background: '#ffffff' }}
        >
          {qrValue ? (
            <QRCodeSVG value={qrValue} size={176} bgColor="#f6f3ff" fgColor="#090812" level="M" />
          ) : (
            <div className="shimmer size-[176px] rounded-lg" />
          )}
        </div>

        <p className="mono max-w-full break-all text-center text-[11px] text-pretty" style={{ color: 'var(--ink-2)' }}>
          {qrMode === 'link' ? (link ?? 'Preparing your link...') : address}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => void copy('link')}
          disabled={!link}
          className="cta flex min-h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold"
        >
          {copied === 'link' ? <Check className="size-4" /> : <Link2 className="size-4" />}
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
        <button
          onClick={() => void copy('address')}
          className="ghost-btn flex min-h-12 items-center justify-center gap-2 rounded-full border text-sm font-semibold"
          style={{ borderColor: 'var(--border-hot)', color: 'var(--ink)' }}
          aria-label={`Copy address ${shortAddress(address)}`}
        >
          {copied === 'address' ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied === 'address' ? 'Copied' : shortAddress(address)}
        </button>
      </div>
      {canShare && (
        <button
          onClick={() => void share()}
          disabled={!link}
          className="ghost-btn flex min-h-11 w-full items-center justify-center gap-2 rounded-full border text-sm font-semibold disabled:opacity-40"
          style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}
        >
          <Share2 className="size-4" />
          Share
        </button>
      )}
    </div>
  )
}
