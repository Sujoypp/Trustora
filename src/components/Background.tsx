/** Ambient layer behind the app: a faint arc wave and a few drifting particles. CSS and SVG only, no canvas. */
const PARTICLES = [
  { x: '8%', s: 3, d: 22, delay: 0, dx: 24 },
  { x: '19%', s: 2, d: 28, delay: 6, dx: -18 },
  { x: '31%', s: 3, d: 25, delay: 12, dx: 30 },
  { x: '44%', s: 2, d: 30, delay: 3, dx: -26 },
  { x: '57%', s: 3, d: 24, delay: 9, dx: 20 },
  { x: '66%', s: 2, d: 27, delay: 15, dx: -22 },
  { x: '77%', s: 3, d: 26, delay: 5, dx: 28 },
  { x: '88%', s: 2, d: 29, delay: 11, dx: -16 },
  { x: '95%', s: 3, d: 23, delay: 17, dx: -24 },
]

export function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <svg className="bg-drift absolute inset-x-0 top-0 h-[520px] w-full" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMin slice" fill="none" style={{ opacity: 0.8, WebkitMaskImage: 'linear-gradient(to bottom, #000 40%, transparent)', maskImage: 'linear-gradient(to bottom, #000 40%, transparent)' }}>
        <defs>
          <linearGradient id="bgArc" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4f8cff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M-40 360 C 260 70, 760 30, 1480 300" stroke="url(#bgArc)" strokeOpacity="0.28" strokeWidth="1" />
        <path d="M-40 360 C 260 70, 760 30, 1480 300" pathLength="1" stroke="url(#bgArc)" strokeWidth="1.6" strokeLinecap="round" className="arc-pulse" style={{ ['--dur' as string]: '9s' }} />
        <path d="M-40 460 C 420 210, 980 340, 1480 190" stroke="url(#bgArc)" strokeOpacity="0.2" strokeWidth="1" />
        <path d="M-40 460 C 420 210, 980 340, 1480 190" pathLength="1" stroke="url(#bgArc)" strokeWidth="1.4" strokeLinecap="round" className="arc-pulse" style={{ ['--dur' as string]: '12s', ['--delay' as string]: '-5s' }} />
      </svg>
      {PARTICLES.map((p, i) => (
        <span key={i} className="particle" style={{ ['--x' as string]: p.x, ['--s' as string]: `${p.s}px`, ['--d' as string]: `${p.d}s`, ['--delay' as string]: `${-p.delay}s`, ['--dx' as string]: `${p.dx}px` }} />
      ))}
    </div>
  )
}
