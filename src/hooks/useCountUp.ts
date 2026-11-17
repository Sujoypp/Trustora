import { useEffect, useRef, useState } from 'react'

/**
 * Eases a bigint amount toward its target in about 400ms using animation frames.
 * The first value is shown as is; later changes (a deposit or a payment) count up or down.
 */
export function useCountUp(target: bigint, durationMs = 400): bigint {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)

  useEffect(() => {
    const from = shownRef.current
    if (from === target) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    const anim = { frame: 0 }
    const tick = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - t) ** 3
      const value = t >= 1 ? target : from + ((target - from) * BigInt(Math.round(eased * 1000))) / 1000n
      shownRef.current = value
      setShown(value)
      if (t < 1) anim.frame = requestAnimationFrame(tick)
    }
    anim.frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(anim.frame)
  }, [target, durationMs])

  return shown
}
