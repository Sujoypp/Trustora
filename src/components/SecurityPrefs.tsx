import { EyeOff } from 'lucide-react'
import { Toggle } from '@/components/SettingsParts'
import { useApp } from '@/lib/appContext'
import { WARN_OPTIONS } from '@/lib/prefs'

/** Balance privacy and the large-payment warning threshold. */
export function SecurityPrefs() {
  const { prefs, setPrefs } = useApp()

  return (
    <div>
      <Toggle
        icon={<EyeOff className="size-4" />}
        label="Hide balances"
        hint="Replace balances with dots across the app."
        checked={prefs.hideBalances}
        onChange={(v) => setPrefs({ hideBalances: v })}
      />
      <div className="mt-5">
        <p className="text-sm font-semibold">Large payment warning</p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
          Ask for an extra confirmation at or above this amount.
        </p>
        <div className="glass-inner mt-3 flex flex-wrap rounded-2xl p-1" role="radiogroup" aria-label="Large payment warning threshold">
          {WARN_OPTIONS.map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={prefs.warnAbove === v}
              onClick={() => setPrefs({ warnAbove: v })}
              className="min-h-10 flex-1 rounded-xl px-3 text-sm font-medium tabular-nums transition-colors"
              style={{
                background: prefs.warnAbove === v ? 'rgba(79,140,255,0.28)' : 'transparent',
                color: prefs.warnAbove === v ? 'var(--ink)' : 'var(--muted)',
              }}
            >
              {v === 0 ? 'Off' : `${v.toLocaleString()}+`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
