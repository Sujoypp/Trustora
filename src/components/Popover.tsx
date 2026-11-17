import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from '@/lib/motion'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  children: ReactNode
  width?: number
  /** Extra classes for the wrapper, for example `static sm:relative` to anchor to a parent on small screens. */
  rootClassName?: string
  /** Where the panel opens relative to its trigger. */
  placement?: 'bottom-end' | 'bottom-start' | 'top-end' | 'right-end'
}

const PLACEMENT = {
  'bottom-start': 'left-0 top-full mt-2.5 origin-top-left',
  'bottom-end': 'right-0 top-full mt-2.5 origin-top-right',
  'top-end': 'bottom-full right-0 mb-3 origin-bottom-right',
  'right-end': 'bottom-0 left-full ml-3 origin-bottom-left',
} as const

export function Popover({ open, onOpenChange, trigger, children, width = 288, placement = 'bottom-end', rootClassName = 'relative' }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div ref={ref} className={rootClassName}>
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={`glass absolute z-50 rounded-xl p-2 ${PLACEMENT[placement]}`}
            style={{ position: 'absolute', width: `min(${width}px, calc(100vw - 2rem))`, background: '#0E1320' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
