// CSS-only stand-in for the animation props the app used to pass to a heavy animation library.
// Elements fade in on mount through the `anim-enter` class; animation-only props are dropped.
import { createElement, forwardRef, type HTMLAttributes, type ReactNode, type SVGProps } from 'react'

interface MotionExtra {
  initial?: unknown
  animate?: unknown
  exit?: unknown
  transition?: unknown
  variants?: unknown
  custom?: unknown
  layout?: unknown
  layoutId?: string
  whileHover?: unknown
  whileTap?: unknown
  whileFocus?: unknown
}

const ANIMATION_PROPS = [
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'custom',
  'layout',
  'layoutId',
  'whileHover',
  'whileTap',
  'whileFocus',
] as const

function strip(props: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...props }
  for (const key of ANIMATION_PROPS) delete rest[key]
  return rest
}

function make<T extends HTMLElement>(tag: string) {
  return forwardRef<T, HTMLAttributes<T> & MotionExtra>(function Fade(props, ref) {
    const { className, ...rest } = strip(props as Record<string, unknown>) as { className?: string }
    return createElement(tag, { ...rest, ref, className: className ? `anim-enter ${className}` : 'anim-enter' })
  })
}

function makeSvg<T extends SVGElement>(tag: string) {
  return forwardRef<T, SVGProps<T> & MotionExtra>(function Svg(props, ref) {
    return createElement(tag, { ...strip(props as Record<string, unknown>), ref })
  })
}

export const motion = {
  div: make<HTMLDivElement>('div'),
  li: make<HTMLLIElement>('li'),
  span: make<HTMLSpanElement>('span'),
  h2: make<HTMLHeadingElement>('h2'),
  header: make<HTMLElement>('header'),
  section: make<HTMLElement>('section'),
  path: makeSvg<SVGPathElement>('path'),
}

/** Children mount and unmount immediately; there are no exit animations. */
export function AnimatePresence({ children }: { children?: ReactNode; initial?: boolean; mode?: string; custom?: unknown }) {
  return <>{children}</>
}
