import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };

type State = { hasError: boolean; message: string };

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message || 'Something went wrong' };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('Route error:', err, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 48, maxWidth: 480, margin: '0 auto',
          fontFamily: 'system-ui, sans-serif', color: '#1e293b',
        }}>
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>This view had a problem</h1>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={() => { this.setState({ hasError: false, message: '' }); window.location.assign('/dashboard'); }}
            style={{
              background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Back to dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
