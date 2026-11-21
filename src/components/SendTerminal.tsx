import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from '@/lib/motion'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { TokenUSDC } from '@web3icons/react'
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Fuel, Info, Loader2, Lock, X } from 'lucide-react'
import { Amount, parseAmount, usdcDecimalsFor } from '@/onchain-money'
import { TxProgress } from '@/components/TxProgress'
import { ReceivePanel } from '@/components/ReceivePanel'
import { RecipientField } from '@/components/RecipientField'
import { MultisigGuard } from '@/components/MultisigGuard'
import { DynamicFeeNote } from '@/components/DynamicFeeNote'
import { GasInUsdc } from '@/components/GasInUsdc'
import { useGuard } from '@/lib/guard'
import { MASK } from '@/lib/prefs'
import { useSendPayment } from '@/hooks/useSendPayment'
import { CHAIN_ID, MAX_NOTE_BYTES, ROUTER_ADDRESS, type Payment, type Rail, type ReceiptData } from '@/lib/trustora'
import { formatFeeUsdc, formatUsdc, noteBytes } from '@/lib/format'

/** Reserve used by MAX when no fee estimate exists yet (0.05 USDC, 6-decimal view). */
const FALLBACK_RESERVE = 50_000n

interface Props {
  balance?: Amount
  onPending: (payment: Payment) => void
  onSettled: (txHash: Hex) => void
  onSuccess: (receipt: ReceiptData) => void
  /** Ask for an extra confirmation at or above this many USDC (0 = never). */
  warnAbove: number
  hideBalance: boolean
  tab: ExchangeTab
  onTabChange: (tab: ExchangeTab) => void
  /** Payment request decoded from a payment link, used to pre-fill the form. */
  prefill: Prefill | null
}

export type ExchangeTab = 'send' | 'receive'

/** Values to pre-fill the form with: from a payment link, a saved contact or the dashboard. */
export interface Prefill {
  to?: string
  amount?: string
  note?: string
  /** True when the values came from a shared payment link, so a safety banner is shown. */
  fromLink?: boolean
}

const RAILS: { id: Rail; label: string; hint: string }[] = [
  { id: 'native', label: 'Native USDC', hint: 'Sent as the gas token' },
  { id: 'erc20', label: 'USDC (ERC-20)', hint: 'Needs a one-time allowance' },
]

export function SendTerminal({ balance, onPending, onSettled, onSuccess, warnAbove, hideBalance, tab, onTabChange, prefill }: Props) {
  const { address, isConnected } = useAccount()
  const [recipientInput, setRecipientInput] = useState(prefill?.to ?? '')
  const [rail, setRail] = useState<Rail>('native')
  const [amount, setAmount] = useState(prefill?.amount ?? '')
  const [note, setNote] = useState(prefill?.note ?? '')
  const [showRequest, setShowRequest] = useState(Boolean(prefill))
  const [checked, setChecked] = useState(false)
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])

  const recipient: Address | null = isAddress(recipientInput.trim()) ? getAddress(recipientInput.trim()) : null
  const amountRaw = useMemo(() => {
    if (!amount) return null
    try {
      const parsed = parseAmount(CHAIN_ID, amount)
      return parsed.isPositive() ? parsed.raw : null
    } catch {
      return null
    }
  }, [amount])

  const handleSuccess = useCallback(
    (receipt: ReceiptData) => {
      setAmount('')
      setNote('')
      setRecipientInput('')
      onSuccess(receipt)
    },
    [onSuccess],
  )

  const { phase, txHash, error, fee, feeLoading, send, clearError } = useSendPayment({
    recipient,
    rail,
    amountRaw,
    note,
    onPending,
    onSettled,
    onSuccess: handleSuccess,
  })

  const busy = phase !== 'idle'
  const bytes = noteBytes(note)
  const balanceRaw = balance?.raw

  const problems: string[] = []
  if (recipientInput.trim() && !recipient) problems.push('Enter a valid wallet address.')
  if (recipient && address && recipient.toLowerCase() === address.toLowerCase()) problems.push('That is your own address.')
  if (amountRaw !== null && balanceRaw !== undefined) {
    if (amountRaw > balanceRaw) problems.push('Amount is higher than your balance.')
    else if (fee && amountRaw + fee.usdc > balanceRaw) problems.push('Not enough left to cover the network fee.')
  }
  if (bytes > MAX_NOTE_BYTES) problems.push(`Note is ${bytes - MAX_NOTE_BYTES} bytes too long.`)

  const [guard, patchGuard] = useGuard(address)
  const guardTriggered = guard.enabled && amountRaw !== null && amountRaw >= BigInt(guard.threshold) * 1_000_000n
  const needsConfirm = guardTriggered || (warnAbove > 0 && amountRaw !== null && amountRaw >= BigInt(warnAbove) * 1_000_000n)
  const ready =
    Boolean(recipient) && amountRaw !== null && problems.length === 0 && Boolean(ROUTER_ADDRESS) && (!needsConfirm || checked)

  const fillMax = () => {
    if (balanceRaw === undefined) return
    const reserve = fee ? fee.usdc * (fee.kind === 'approval' ? 3n : 2n) : FALLBACK_RESERVE
    const max = balanceRaw > reserve ? balanceRaw - reserve : 0n
    setAmount(Amount.fromRaw(max, usdcDecimalsFor(CHAIN_ID)).toString())
  }



  return (
    <section className="glass glass-hover relative overflow-hidden rounded-xl p-5 sm:p-6" aria-labelledby="send-title">
      <div className="mb-4">
        <h2 id="send-title" className="eyebrow">
          Secure Exchange
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          {tab === 'send' ? 'Send USDC instantly with an optional onchain note.' : 'Request USDC with a shareable link or QR code.'}
        </p>
      </div>

      <div className="glass-inner mb-5 grid grid-cols-2 rounded-full p-1" role="tablist" aria-label="Exchange mode">
        {([
          { id: 'send', label: 'Send', icon: ArrowUpRight },
          { id: 'receive', label: 'Receive', icon: ArrowDownLeft },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            disabled={busy}
            onClick={() => onTabChange(id)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all"
            style={{
              background: tab === id ? 'rgba(99,102,241,0.28)' : 'transparent',
              color: tab === id ? '#fff' : 'var(--muted)',
              }}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'receive' ? (
        <ReceivePanel address={address} />
      ) : (
      <div className="space-y-4">
        {showRequest && prefill?.fromLink && (
          <div
            className="flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm"
            style={{ borderColor: 'var(--border-hot)', background: 'rgba(99,102,241,0.12)', color: 'var(--ink-2)' }}
          >
            <Info className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <p className="flex-1 text-pretty">This form was filled in from a payment link. Check the recipient before you send.</p>
            <button onClick={() => setShowRequest(false)} aria-label="Dismiss" className="flex size-6 items-center justify-center rounded-md hover:bg-white/10">
              <X className="size-4" />
            </button>
          </div>
        )}
        <RecipientField value={recipientInput} onChange={setRecipientInput} disabled={busy} />

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
            Token
          </span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Token">
            {RAILS.map((r) => {
              const active = rail === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy}
                  onClick={() => setRail(r.id)}
                  className="rounded-2xl border p-3 text-left transition-all hover:scale-[1.01] active:scale-[0.98]"
                  style={{
                    borderColor: active ? 'rgba(99,102,241,0.6)' : 'var(--border)',
                    background: active ? 'rgba(99,102,241,0.09)' : 'rgba(9,8,18,0.5)',
                    }}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <TokenUSDC variant="branded" size={18} />
                    {r.label}
                  </span>
                  <span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>
                    {r.hint}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
            <Info className="mt-px size-3.5 shrink-0" />
            On Arc the gas token is USDC. Both options spend the same balance.
          </p>
        </div>

        <div className="glass-inner rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <input
              inputMode="decimal"
              value={amount}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (/^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
              }}
              placeholder="0.00"
              aria-label="Amount in USDC"
              className="display w-full min-w-0 bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-[#64748B]"
            />
            <span className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>
              USDC
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="tabular-nums" style={{ color: 'var(--subtle)' }}>
              {balanceRaw !== undefined ? `Balance ${hideBalance ? MASK : formatUsdc(balanceRaw)} USDC` : 'Balance unavailable'}
            </span>
            <button
              type="button"
              onClick={fillMax}
              disabled={busy || balanceRaw === undefined}
              className="ghost-btn min-h-8 rounded-lg border px-3 font-semibold tracking-wide disabled:opacity-40"
              style={{ borderColor: 'rgba(99,102,241,0.35)', color: 'var(--accent)' }}
            >
              MAX
            </button>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
            Payment note (optional)
            <span className="tabular-nums normal-case tracking-normal" style={{ color: bytes > MAX_NOTE_BYTES ? 'var(--danger)' : 'var(--subtle)' }}>
              {bytes}/{MAX_NOTE_BYTES}
            </span>
          </span>
          <div className="glass-inner flex items-center gap-2 rounded-2xl px-4 py-3">
            <Lock className="size-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              placeholder="What is this payment for?"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#64748B]"
            />
          </div>
        </label>

        <MultisigGuard guard={guard} onChange={patchGuard} disabled={busy} triggered={guardTriggered} />

        <GasInUsdc feeUsdc={fee?.usdc} loading={feeLoading} />

        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
              <Fuel className="size-4" />
              {fee?.kind === 'approval' ? 'Allowance fee' : 'Network fee'}
            </span>
            <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>
              {feeLoading ? (
                <span className="shimmer inline-block h-3.5 w-16 rounded" />
              ) : fee ? (
                `~${formatFeeUsdc(fee.usdc)} USDC`
              ) : (
                '--'
              )}
            </span>
          </div>
          {fee?.kind === 'approval' && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--subtle)' }}>
              The payment fee is estimated once the allowance is in place.
            </p>
          )}
          <div className="mt-2">
            <DynamicFeeNote />
          </div>
        </div>

        <AnimatePresence initial={false}>
          {(problems.length > 0 || error || !ROUTER_ADDRESS) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div
                className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: 'rgba(251,113,133,0.35)', background: 'rgba(251,113,133,0.08)', color: 'var(--danger)' }}
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div>
                  {!ROUTER_ADDRESS && <p>The TrustoraPay contract is not deployed yet, so sending is paused.</p>}
                  {problems.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                  {error && <p>{error}</p>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {needsConfirm && (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.07)' }}>
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4 accent-violet-500" />
            <span className="text-pretty" style={{ color: 'var(--ink-2)' }}>
              {guardTriggered ? 'This payment is above my multisig guard threshold. I have double-checked the recipient and the amount.' : 'This is a large payment. I have double-checked the recipient and the amount.'}
            </span>
          </label>
        )}

        {isConnected ? (
          <button
            type="button"
            onPointerDown={(e) => {
              if (!ready || busy) return
              const rect = e.currentTarget.getBoundingClientRect()
              const id = Date.now()
              setRipples((list) => [...list, { id, x: e.clientX - rect.left, y: e.clientY - rect.top, size: rect.width * 2.2 }])
              setTimeout(() => setRipples((list) => list.filter((r) => r.id !== id)), 750)
            }}
            onClick={() => {
              clearError()
              void send()
            }}
            disabled={!ready || busy}
            className="cta flex min-h-14 w-full items-center justify-center gap-2 rounded-full text-base font-semibold"
          >
            {ripples.map((r) => (
              <span key={r.id} className="ripple" style={{ left: r.x, top: r.y, width: r.size, height: r.size }} />
            ))}
            {busy ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Send {amountRaw !== null ? `${formatUsdc(amountRaw, amountRaw % 10_000n === 0n ? 2 : 6)} USDC` : 'payment'}
                <ArrowUpRight className="size-5" />
              </>
            )}
          </button>
        ) : (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button type="button" onClick={show} className="cta min-h-14 w-full rounded-full text-base font-semibold">
                Connect wallet to send
              </button>
            )}
          </ConnectKitButton.Custom>
        )}
      </div>
      )}

      <TxProgress phase={phase} txHash={txHash} title="Sending payment" />
    </section>
  )
}
