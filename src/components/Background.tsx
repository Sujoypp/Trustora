import { memo } from 'react'

const RINGS = [
  { size: 'min(560px, 80vmin)', border: '1px solid rgba(99,102,241,0.16)', dur: '45s', rev: false, node: '#818cf8' },
  { size: 'min(860px, 125vmin)', border: '1px dashed rgba(34,211,238,0.10)', dur: '38s', rev: true, node: '#22d3ee' },
  { size: 'min(1180px, 170vmin)', border: '1px solid rgba(99,102,241,0.10)', dur: '30s', rev: false, node: '#a5b4fc' },
] as const

const ARCS = [
  { d: 'M-40 380 C 300 70, 820 40, 1480 300', dur: '7s', delay: '0s' },
  { d: 'M-40 270 C 420 -20, 940 130, 1480 100', dur: '9s', delay: '-3s' },
  { d: 'M-40 490 C 460 220, 1000 350, 1480 200', dur: '11s', delay: '-6s' },
] as const

/**
 * Ambient layer behind the app: concentric orbital rings with slow light nodes, a few glowing SVG arcs with a
 * pulse traveling along them,. Pure CSS and SVG, transform and dash-offset animation only.
 */
export const Background = memo(function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <svg className="bg-drift absolute inset-x-0 top-0 h-[520px] w-full" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMin slice" fill="none" style={{ maskImage: 'linear-gradient(to bottom, #000 55%, transparent)' }}>
        <defs>
          <linearGradient id="bg-arc" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1440" y2="0">
            <stop offset="0" stopColor="#6366F1" />
            <stop offset="0.55" stopColor="#22D3EE" />
            <stop offset="1" stopColor="#6366F1" />
          </linearGradient>
        </defs>
        {ARCS.map((a) => (
          <g key={a.d}>
            <path d={a.d} stroke="url(#bg-arc)" strokeOpacity="0.14" strokeWidth="1" />
            <path d={a.d} pathLength={1} className="arc-pulse" style={{ ['--dur' as string]: a.dur, ['--delay' as string]: a.delay }} stroke="url(#bg-arc)" strokeOpacity="0.2" strokeWidth="5" strokeLinecap="round" />
            <path d={a.d} pathLength={1} className="arc-pulse" style={{ ['--dur' as string]: a.dur, ['--delay' as string]: a.delay }} stroke="url(#bg-arc)" strokeOpacity="0.85" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        ))}
      </svg>

      <div className="absolute left-1/2 top-[32%]">
        {RINGS.map((r) => (
          <div key={r.size} className="absolute left-1/2 top-1/2 rounded-full" style={{ width: r.size, height: r.size, translate: '-50% -50%', border: r.border }}>
            <div className={`bg-spin ${r.rev ? 'bg-spin-rev' : ''} absolute inset-0 rounded-full`} style={{ ['--dur' as string]: r.dur }}>
              <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: r.node, boxShadow: `0 0 10px 2px ${r.node}88` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
