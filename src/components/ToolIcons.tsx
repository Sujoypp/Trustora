import type { ReactNode } from 'react'

/**
 * Duotone icons for the four core tools: a translucent fill in the secondary tone (--duo) under
 * crisp strokes in the card's accent color. Pure SVG.
 */
interface IconProps {
  className?: string
}

function Duo({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

const FILL = { fill: 'var(--duo, #22d3ee)', fillOpacity: 0.28, stroke: 'none' } as const

export const SendIcon = ({ className }: IconProps) => (
  <Duo className={className}>
    <path d="M3.500 11.500 20.500 3.500l-6.600 17.500-3.100-7.200-7.300-2.300Z" {...FILL} />
    <path d="M3.500 11.500 20.500 3.500l-6.600 17.500-3.100-7.200-7.300-2.300Z" />
    <path d="m10.800 13.800 9.700-10.300" />
  </Duo>
)

export const ContractIcon = ({ className }: IconProps) => (
  <Duo className={className}>
    <path d="M6 3h8l4.500 4.500V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" {...FILL} />
    <path d="M6 3h8l4.500 4.500V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v4.500h4.500M10 12l-2 2 2 2M14 12l2 2-2 2" />
  </Duo>
)

export const HistoryIcon = ({ className }: IconProps) => (
  <Duo className={className}>
    <circle cx="12" cy="12" r="8.500" {...FILL} />
    <path d="M3.500 12a8.500 8.500 0 1 0 2.600-6.100L3.500 8.500M3.500 4v4.500H8M12 7.500V12l3 2" />
  </Duo>
)

export const VaultIcon = ({ className }: IconProps) => (
  <Duo className={className}>
    <path d="M12 3 4.500 6v5.500c0 4.600 3.100 8 7.500 9.500 4.400-1.500 7.500-4.900 7.500-9.500V6L12 3Z" {...FILL} />
    <path d="M12 3 4.500 6v5.500c0 4.600 3.100 8 7.500 9.500 4.400-1.500 7.500-4.900 7.500-9.500V6L12 3Z" />
    <rect x="9" y="10.500" width="6" height="4.500" rx="1" />
    <path d="M10.500 10.500V9a1.500 1.500 0 0 1 3 0v1.500" />
  </Duo>
)

export const SwapIcon = ({ className }: IconProps) => (
  <Duo className={className}>
    <circle cx="12" cy="12" r="9" {...FILL} />
    <path d="M7 9.500h9.500M13.500 6l3 3.500-3 3.500M17 14.500H7.500M10.500 11l-3 3.500 3 3.500" />
  </Duo>
)

export const BridgeIcon = ({ className }: IconProps) => (
  <Duo className={className}>
    <path d="M3 17c0-5 4-9 9-9s9 4 9 9H3Z" {...FILL} />
    <path d="M3 17c0-5 4-9 9-9s9 4 9 9M2 17h20M7 17v-4M12 17V8M17 17v-4" />
  </Duo>
)
