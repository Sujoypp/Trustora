import { memo } from 'react'

/**
 * Quiet ambient lighting: a royal-indigo glow in the top-left corner and a faint electric-mint fade
 * low on the right. Plain radial gradients, no filters and no animation, so it costs nothing to paint.
 */
export const Background = memo(function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute -left-40 -top-48 size-[720px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(67, 56, 202, 0.18), transparent)' }}
      />
      <div
        className="absolute -bottom-56 -right-48 size-[760px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(52, 211, 153, 0.075), transparent)' }}
      />
    </div>
  )
})
