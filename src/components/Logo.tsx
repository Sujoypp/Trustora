import { navigate } from '@/lib/router'

interface Props {
  /** "lg" is a larger lockup for hero use. */
  size?: 'sm' | 'lg'
  /** Clickable lockup that returns to the Dashboard. Turn off where a click should do nothing. */
  interactive?: boolean
}

/** Shield-prism "T" in a solid indigo frame, ringed by a slow dual-tone (Arc indigo, Circle cyan) orbit,, next to the TRUSTORA | UNIFIED TRUST wordmark. Flat vectors only: no glow, blur or particles. */
export function Logo({ size = 'sm', interactive = true }: Props) {
  const lg = size === 'lg'

  const content = (
    <>
      <span className="relative ml-1 flex shrink-0 items-center justify-center">
        <svg viewBox="0 0 50 50" fill="none" className="logo-ring pointer-events-none absolute -inset-[7px] size-[calc(100%+14px)]" aria-hidden="true">
          <circle cx="25" cy="25" r="23.500" pathLength={1} stroke="#6366F1" strokeWidth="1.800" strokeLinecap="round" strokeDasharray="0.40 0.60" />
          <circle cx="25" cy="25" r="23.500" pathLength={1} stroke="#22D3EE" strokeWidth="1.800" strokeLinecap="round" strokeDasharray="0.40 0.60" strokeDashoffset="-0.5" />
        </svg>
        <span
        className={`flex shrink-0 items-center justify-center rounded-xl border-2 border-indigo-500 bg-indigo-500/10 transition-transform duration-150 ease-out group-hover:scale-105 ${lg ? 'size-14' : 'size-9'}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" className={lg ? 'size-9' : 'size-6'}>
          <path d="M12 2.500 4 5.500v6c0 5 3.300 8.300 8 10V2.500Z" fill="#6366F1" />
          <path d="M12 2.500 20 5.500v6c0 5-3.300 8.300-8 10V2.500Z" fill="#4F46E5" />
          <path
            d="M12 2.500 20 5.500v6c0 5-3.300 8.300-8 10-4.700-1.700-8-5-8-10v-6L12 2.500Z"
            stroke="#C7D2FE"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          <path d="M8.500 8.500h7M12 8.500v7" stroke="#FFFFFF" strokeWidth="1.900" strokeLinecap="round" />
        </svg>
        </span>
      </span>

      <span className="ml-2.5 flex min-w-0 items-center sm:ml-3">
        <span className={`brand-title shrink-0 whitespace-nowrap font-extrabold tracking-[0.16em] ${lg ? 'text-2xl' : 'text-lg'}`}>TRUSTORA</span>
        <span className="mx-3 hidden h-5 w-px bg-white/20 sm:block" aria-hidden="true" />
        <span className={`hidden font-medium uppercase tracking-[0.25em] text-indigo-300 sm:block ${lg ? 'text-sm' : 'text-xs'}`}>Unified Trust</span>
      </span>
    </>
  )

  if (!interactive) return <div className="flex items-center">{content}</div>

  return (
    <button
      type="button"
      onClick={() => navigate('/')}
      className="group flex items-center rounded-xl transition-transform duration-150 ease-out active:scale-95"
      aria-label="TRUSTORA, Unified Trust: back to Dashboard"
    >
      {content}
    </button>
  )
}
