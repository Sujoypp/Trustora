import { useId } from 'react'
import { navigate } from '@/lib/router'

/** Shield outline, in a 64x64 box. */
const SHIELD = 'M32 5 54 12.5V30c0 13.5-9 22.5-22 28.5C19 52.5 10 43.5 10 30V12.5L32 5Z'
/** The nodes of the network. H is the center of the T bar. */
const NODES = [
  { id: 'A', x: 32, y: 15.5, r: 2 },
  { id: 'B', x: 21, y: 25, r: 2.1 },
  { id: 'C', x: 43, y: 25, r: 2.1 },
  { id: 'H', x: 32, y: 25, r: 2.7 },
  { id: 'D', x: 22, y: 37.5, r: 2 },
  { id: 'E', x: 42, y: 37.5, r: 2 },
  { id: 'G', x: 32, y: 47, r: 2.4 },
] as const

const RING = 'M32 1.6a30.4 30.4 0 1 1 0 60.8 30.4 30.4 0 1 1 0-60.8Z'

/**
 * The TRUSTORA mark: a metallic shield with depth, an interconnected node network, and a subtle "T" formed by the
 * brightest links. Silver metal, electric cyan and blue light. Static SVG: no animation.
 */
export function BrandMark({ className = 'size-11', ring = false }: { className?: string; ring?: boolean }) {
  const uid = useId().replace(/:/g, '')
  const url = (name: string) => `url(#${uid}-${name})`
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-metal`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="0.28" stopColor="#9fb0cc" />
          <stop offset="0.5" stopColor="#eaf1fc" />
          <stop offset="0.78" stopColor="#6f819f" />
          <stop offset="1" stopColor="#c9d6ea" />
        </linearGradient>
        <linearGradient id={`${uid}-body`} x1="12" y1="8" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14336f" />
          <stop offset="0.55" stopColor="#0a1a44" />
          <stop offset="1" stopColor="#050c22" />
        </linearGradient>
        <linearGradient id={`${uid}-light`} x1="12" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#67e8f9" />
          <stop offset="0.55" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#4f8cff" />
        </linearGradient>
        <radialGradient id={`${uid}-node`} cx="0.4" cy="0.35" r="0.75">
          <stop stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#9ff0ff" />
          <stop offset="1" stopColor="#22d3ee" />
        </radialGradient>
      </defs>

      {ring && (
        <g className="logo-ring" style={{ transformOrigin: '32px 32px' }}>
          <circle cx="32" cy="32" r="30.4" stroke="#6366f1" strokeOpacity="0.14" strokeWidth="1.2" />
          <path d={RING} pathLength="1" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.3 0.7" />
          <path d={RING} pathLength="1" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.3 0.7" strokeDashoffset="-0.5" />
        </g>
      )}

      {/* Shield: navy body, a lit left facet, a metallic edge and an inner bevel for depth */}
      <path d={SHIELD} fill={url('body')} />
      <path d="M32 5 10 12.5V30c0 13.5 9 22.5 22 28.5V5Z" fill="#ffffff" fillOpacity="0.07" />
      <path d={SHIELD} transform="translate(32 33) scale(0.88) translate(-32 -33)" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M32 5 54 12.5V16L32 9 10 16v-3.5L32 5Z" fill="#ffffff" fillOpacity="0.18" />
      <path d={SHIELD} pathLength="1" stroke={url('metal')} strokeWidth="2.2" strokeLinejoin="round" />

      {/* Network links, then the brighter T: the bar and the stem */}
      <g stroke={url('light')} strokeOpacity="0.4" strokeWidth="1" strokeLinecap="round">
        <path d="M32 15.5V25M21 25 22 37.5M43 25 42 37.5M22 37.5 32 47M42 37.5 32 47" />
      </g>
      <g stroke="#eef8ff" strokeWidth="2.2" strokeLinecap="round">
        <path d="M21 25H43" pathLength="1" />
        <path d="M32 25V47" pathLength="1" />
      </g>
      {NODES.map((n) => (
        <circle key={n.id} cx={n.x} cy={n.y} r={n.r} fill={url('node')} stroke="#ffffff" strokeOpacity="0.7" strokeWidth="0.6" />
      ))}
    </svg>
  )
}

interface Props {
  size?: 'sm' | 'lg'
  /** Clicking the mark returns to the dashboard. Turn off where the logo is decorative. */
  interactive?: boolean
}

export function Logo({ size = 'sm', interactive = true }: Props) {
  const lg = size === 'lg'
  const content = (
    <>
      <BrandMark className={lg ? 'size-14' : 'size-11'} ring />
      <span className="flex min-w-0 items-center">
        <span className={`brand-title shrink-0 whitespace-nowrap font-extrabold tracking-[0.12em] sm:tracking-[0.16em] ${lg ? 'text-2xl' : 'text-lg'}`} style={{ fontFamily: "'Space Grotesk', 'DM Sans', sans-serif" }}>
          TRUSTORA
        </span>
        <span className="mx-3 hidden h-5 w-px sm:block" style={{ background: 'rgba(130,170,255,0.3)' }} aria-hidden="true" />
        <span className={`hidden font-medium uppercase tracking-[0.25em] sm:block ${lg ? 'text-sm' : 'text-[11px]'}`} style={{ color: '#9fc2ff' }}>
          Unified Trust
        </span>
      </span>
    </>
  )
  if (!interactive) return <div className="flex min-w-0 items-center gap-3">{content}</div>
  return (
    <button type="button" onClick={() => navigate('/')} aria-label="TRUSTORA home" className="group flex min-w-0 items-center gap-2.5 rounded-xl active:scale-95">
      {content}
    </button>
  )
}
