import { Clipboard, UserRound } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** Recipient input for a wallet address, with a paste button. */
export function RecipientField({ value, onChange, disabled }: Props) {
  const paste = async () => {
    try {
      onChange((await navigator.clipboard.readText()).trim())
    } catch {
      // clipboard permission denied: typing or pasting by hand still works
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        Recipient
      </span>
      <div className="glass-inner flex items-center gap-1.5 rounded-2xl pl-4 pr-2">
        <UserRound className="size-4 shrink-0" style={{ color: 'var(--accent)' }} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0x..."
          aria-label="Recipient wallet address"
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          className="mono min-h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#64748B]"
        />
        <button
          type="button"
          onClick={() => void paste()}
          disabled={disabled}
          aria-label="Paste address"
          title="Paste"
          className="ghost-btn flex size-10 shrink-0 items-center justify-center rounded-xl border"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <Clipboard className="size-4" />
        </button>
      </div>
    </div>
  )
}
