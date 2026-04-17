import { Component, type ErrorInfo, type ReactNode } from 'react'

interface SemanticodeErrorBoundaryProps {
  children: ReactNode
  resetKey: string
}

interface SemanticodeErrorBoundaryState {
  error: Error | null
}

export class SemanticodeErrorBoundary extends Component<
  SemanticodeErrorBoundaryProps,
  SemanticodeErrorBoundaryState
> {
  state: SemanticodeErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): SemanticodeErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[semanticode] renderer error boundary caught an error.', error, errorInfo)
  }

  componentDidUpdate(prevProps: SemanticodeErrorBoundaryProps) {
    if (
      this.state.error &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <section className="cbv-render-error">
        <p className="cbv-eyebrow">Rendering Error</p>
        <strong>The current view crashed.</strong>
        <p>{this.state.error.message}</p>
        <button
          className="cbv-toolbar-button"
          onClick={() => this.setState({ error: null })}
          type="button"
        >
          Dismiss Error
        </button>
      </section>
    )
  }
}
