import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in its
 * child component tree and displays a fallback UI instead of crashing the app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error)
    console.error('Component stack:', errorInfo.componentStack)

    this.setState({ errorInfo })

    // TODO: Send to error reporting service (e.g., Sentry)
    // logErrorToService(error, errorInfo)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleGoHome = (): void => {
    window.location.href = '/'
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      return (
        <div className="min-h-screen bg-ash flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface-900 border border-surface-700 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-red-500/10 border border-red-500/30">
                <AlertTriangle className="w-6 h-6 text-red-400" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-steel">Something went wrong</h1>
                <p className="text-sm text-steel-dim">An unexpected error has occurred</p>
              </div>
            </div>

            {this.state.error && (
              <div className="mb-6 p-4 bg-surface-800 border border-surface-600">
                <p className="text-xs font-mono text-steel-dim mb-1">ERROR</p>
                <p className="text-sm text-red-300 font-mono break-all">
                  {this.state.error.message || 'Unknown error'}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center gap-2 py-3 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity"
              >
                <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
                Try Again
              </button>

              <button
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-2 py-3 bg-surface-700 text-steel hover:bg-surface-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
                Reload Page
              </button>

              <button
                onClick={this.handleGoHome}
                className="w-full flex items-center justify-center gap-2 py-3 border border-surface-600 text-steel-dim hover:text-steel hover:border-surface-500 transition-colors"
              >
                <Home className="w-4 h-4" strokeWidth={1.5} />
                Go to Home
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="mt-6">
                <summary className="text-xs text-steel-dim cursor-pointer hover:text-steel">
                  Show stack trace
                </summary>
                <pre className="mt-2 p-3 bg-surface-800 text-xs text-steel-dim overflow-auto max-h-48 font-mono">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
