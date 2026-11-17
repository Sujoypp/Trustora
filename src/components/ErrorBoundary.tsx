import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { navigate } from '@/lib/router'

interface Props {
  children: ReactNode
  /** When this value changes (for example on navigation), a shown error is cleared. */
  resetKey?: string
  /** Use the whole-page layout instead of an in-page card. */
  fullPage?: boolean
}

interface State {
  error: Error | null
}

const isLoadFailure = (e: Error) => /dynamically imported module|loading chunk|importing a module script failed/i.test(e.message)

/** Catches rendering errors so one broken screen never blanks the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Trustora UI error:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const loadFailure = isLoadFailure(error)

    return (
      <div className={`flex items-center justify-center ${this.props.fullPage ? 'min-h-dvh p-6' : 'min-h-[50vh] py-10'}`} role="alert">
        <div className="glass w-full max-w-md p-6 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl" style={{ background: 'rgba(245,158,11,0.14)', color: 'var(--amber)' }}>
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">{loadFailure ? 'Could not load this screen' : 'This screen hit a problem'}</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {loadFailure
              ? 'The connection dropped while loading. Check your internet and try again.'
              : 'Your funds and saved data are safe. You can try again or go back to the Dashboard.'}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => (loadFailure ? window.location.reload() : this.setState({ error: null }))}
              className="cta min-h-10 text-sm font-semibold"
            >
              {loadFailure ? 'Reload' : 'Try again'}
            </button>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null })
                navigate('/')
              }}
              className="ghost-btn min-h-10 border text-sm font-medium"
              style={{ borderColor: 'var(--border)' }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
}
