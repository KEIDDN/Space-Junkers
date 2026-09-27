import { Component, type ReactNode } from 'react';

/** Shows a readable error instead of a black screen if the UI crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen crt">
        <div className="panel select-panel">
          <div className="panel-title bad">SYSTEM FAULT</div>
          <pre className="small dim" style={{ whiteSpace: 'pre-wrap', maxWidth: 560 }}>{String(this.state.error.stack ?? this.state.error)}</pre>
          <button className="deploy" onClick={() => location.reload()}>[ REBOOT ]</button>
        </div>
      </div>
    );
  }
}
