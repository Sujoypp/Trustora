import { useId } from 'react'
import { navigate } from '@/lib/router'

interface Props {
  /** "lg" is the larger lockup used in the dashboard hero. */
  size?: 'sm' | 'lg'
  /** Clickable lockup that returns to the Dashboard. Turn off where a click should do nothing. */
  interactive?: boolean
}

/** Prismatic "T" crossed by a glowing infinity loop, inside orbiting particle rings, with the TRUSTORA | UNIFIED TRUST wordmark. */
export function Logo({ size = 'sm', interactive = true }: Props) {
  const uid = useId()
  const lg = size === 'lg'

  const content = (
    <>
      <span className={`relative flex shrink-0 transition-transform duration-200 ease-out group-hover:scale-105 ${lg ? 'size-16' : 'size-10'}`} aria-hidden="true">
        {/* Aura on hover */}
        <span
          className="pointer-events-none absolute -inset-1.5 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ background: 'radial-gradient(closest-side, rgba(99,102,241,0.6), rgba(34,211,238,0.28) 62%, transparent)' }}
        />
        <svg viewBox="0 0 64 64" fill="none" className="relative size-full">
          <defs>
            <linearGradient id={`${uid}-g`} gradientUnits="userSpaceOnUse" x1="10" y1="8" x2="54" y2="56">
              <stop offset="0" stopColor="#6366F1" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
            <radialGradient id={`${uid}-glow`} cx="32" cy="32" r="30" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#6366F1" stopOpacity="0.5" />
              <stop offset="0.6" stopColor="#22D3EE" stopOpacity="0.12" />
              <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Backing glow that breathes */}
          <circle className="logo-core" cx="32" cy="32" r="30" fill={`url(#${uid}-glow)`} />

          {/* Outer halo: two thin rings that pulse together */}
          <g className="logo-halo-pulse" stroke={`url(#${uid}-g)`} strokeWidth="1">
            <circle cx="32" cy="32" r="30" strokeOpacity="0.55" />
            <circle cx="32" cy="32" r="28.200" strokeOpacity="0.28" />
          </g>

          {/* Orbit 1: a ring of tiny particles drifting slowly */}
          <g className="logo-dots">
            <circle cx="32" cy="32" r="25.500" stroke={`url(#${uid}-g)`} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="0.01 5.340" />
          </g>

          {/* Orbit 2: three bright particles circling the other way */}
          <circle cx="32" cy="32" r="21.500" stroke="rgba(129,140,248,0.22)" strokeWidth="0.8" />
          <g className="logo-particles">
            <circle cx="53.500" cy="32" r="1.800" fill="#22D3EE" />
            <circle cx="21.250" cy="50.620" r="1.500" fill="#6366F1" />
            <circle cx="21.250" cy="13.380" r="1.200" fill="#E0E7FF" />
          </g>

          {/* Prismatic T: three floating layers, back to front */}
          <g className="logo-float" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 21h20M32 21v21" stroke="#6366F1" strokeOpacity="0.4" strokeWidth="5" transform="translate(1.800 1.800)" />
            <path d="M22 21h20M32 21v21" stroke="#22D3EE" strokeOpacity="0.5" strokeWidth="4" transform="translate(-0.900 -0.900)" />
            <path d="M22 21h20M32 21v21" stroke={`url(#${uid}-g)`} strokeWidth="3.200" />
          </g>

          {/* Cryptographic infinity loop through the T, with a light running along it */}
          <g strokeLinecap="round" strokeLinejoin="round">
            <path
              id={`${uid}-inf`}
              d="M32 33C32 28.500 26.500 27 23.500 30C20.500 33 22 38.500 26.500 38.500C30 38.500 32 35.500 32 33C32 35.500 34 38.500 37.500 38.500C42 38.500 43.500 33 40.500 30C37.500 27 32 28.500 32 33Z"
              stroke={`url(#${uid}-g)`}
              strokeWidth="1.400"
              strokeOpacity="0.8"
            />
            <path
              className="logo-loop"
              pathLength={1}
              d="M32 33C32 28.500 26.500 27 23.500 30C20.500 33 22 38.500 26.500 38.500C30 38.500 32 35.500 32 33C32 35.500 34 38.500 37.500 38.500C42 38.500 43.500 33 40.500 30C37.500 27 32 28.500 32 33Z"
              stroke="#F5F7FF"
              strokeWidth="2"
            />
          </g>
        </svg>
      </span>

      <span className={`flex min-w-0 items-center ${lg ? 'gap-4' : 'gap-3'}`}>
        <span
          className={`max-[420px]:sr-only brand-font animate-shimmer bg-gradient-to-r from-white via-indigo-200 to-white bg-[length:200%_auto] bg-clip-text font-bold leading-none tracking-[0.2em] text-transparent ${
            lg ? 'text-2xl sm:text-3xl' : 'text-[15px] sm:text-base'
          }`}
        >
          TRUSTORA
        </span>
        <span className={`brand-fade h-4 w-[1px] shrink-0 bg-white/15 ${lg ? 'hidden sm:block' : 'hidden md:block'}`} aria-hidden="true" />
        <span
          className={`brand-fade font-medium uppercase leading-none tracking-[0.25em] text-indigo-300/80 [text-shadow:0_0_14px_rgba(129,140,248,0.45)] ${
            lg ? 'hidden text-xs sm:block' : 'hidden text-xs md:block'
          }`}
        >
          Unified Trust
        </span>
      </span>
    </>
  )

  if (!interactive) return <div className="group flex items-center gap-3">{content}</div>

  return (
    <button
      type="button"
      onClick={() => navigate('/')}
      aria-label="TRUSTORA Unified Trust: go to the Dashboard"
      className="group flex items-center gap-3 rounded-xl py-1 pr-1 transition-transform duration-150 ease-out active:scale-95"
    >
      {content}
    </button>
  )
}
