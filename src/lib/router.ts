import { useSyncExternalStore } from 'react'

/** A tiny History API router: path-based, with slide direction and an in-app back stack. */
export interface RouteState {
  /** Position in this app's navigation stack; 0 is the first entry. */
  idx: number
  /** 1 when moving forward, -1 when moving back. Drives the slide direction. */
  dir: 1 | -1
  path: string
  search: string
  /** Serializable data handed over with `navigate`, for example a pre-filled draft. */
  data: Record<string, unknown>
  /** Path of the screen this one was opened from, when known. */
  from?: string
}

interface StoredState {
  idx?: number
  data?: Record<string, unknown>
  from?: string
}

const listeners = new Set<() => void>()

const normalizePath = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path) || '/'

function read(dir: 1 | -1): RouteState {
  const stored = (history.state ?? {}) as StoredState
  return {
    idx: stored.idx ?? 0,
    dir,
    path: normalizePath(window.location.pathname),
    search: window.location.search,
    data: stored.data ?? {},
    from: stored.from,
  }
}

if (typeof window !== 'undefined' && (history.state as StoredState | null)?.idx === undefined) {
  history.replaceState({ idx: 0, data: {} } satisfies StoredState, '', window.location.href)
}

let current: RouteState = typeof window === 'undefined' ? { idx: 0, dir: 1, path: '/', search: '', data: {} } : read(1)

function emit() {
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const next = read(1)
    current = { ...next, dir: next.idx >= current.idx ? 1 : -1 }
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

interface NavigateOptions {
  replace?: boolean
  data?: Record<string, unknown>
  dir?: 1 | -1
}

export function navigate(to: string, { replace = false, data = {}, dir }: NavigateOptions = {}): void {
  const url = new URL(to, window.location.origin)
  const idx = replace ? current.idx : current.idx + 1
  const from = replace ? current.from : current.path
  const state: StoredState = { idx, data, from }
  if (replace) history.replaceState(state, '', url.pathname + url.search)
  else history.pushState(state, '', url.pathname + url.search)
  current = {
    idx,
    dir: dir ?? (replace ? current.dir : 1),
    path: normalizePath(url.pathname),
    search: url.search,
    data,
    from,
  }
  window.scrollTo({ top: 0, behavior: 'instant' })
  emit()
}

/** Goes back one step inside the app, or to `fallback` when there is nothing to go back to. */
export function goBack(fallback = '/'): void {
  if (current.idx > 0) {
    history.back()
  } else {
    navigate(fallback, { replace: true, dir: -1 })
  }
}

export function useRoute(): RouteState {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  )
}
