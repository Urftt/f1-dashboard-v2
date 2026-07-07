// A crash in one page degrades to a panel with a reload button instead of a
// blank screen. State (clock, weekend, selection) lives in URL/sessionStorage,
// so reloading loses nothing.

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel" style={{ maxWidth: 520, margin: '48px auto' }}>
          <div className="panel-head">
            <h3>Something broke</h3>
          </div>
          <div className="panel-body">
            <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
              This page hit an error. Your replay clock and selection are safe — reloading picks
              up where you were.
            </p>
            <pre
              className="num"
              style={{
                fontSize: 11,
                color: 'var(--text-faint)',
                whiteSpace: 'pre-wrap',
                maxHeight: 120,
                overflow: 'auto',
              }}
            >
              {String(this.state.error.message ?? this.state.error)}
            </pre>
            <button className="primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
