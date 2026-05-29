import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-8">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-card border border-status-critical/30 bg-status-critical-subtle/30 p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-status-critical" />
        <div>
          <p className="text-[18px] font-semibold text-text-primary">
            Something went wrong
          </p>
          <p className="mt-1 text-[13px] text-text-secondary">
            This page hit an unexpected error.
          </p>
        </div>
        <pre className="max-h-32 w-full overflow-auto rounded border border-border bg-canvas-deep p-3 text-left font-mono text-[11px] text-status-critical">
          {error.message || String(error)}
        </pre>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-text-primary hover:bg-surface-hover"
        >
          <RefreshCw className="h-3 w-3" />
          Try again
        </button>
      </div>
    </div>
  );
}

// Wraps children in an ErrorBoundary that resets whenever the route changes.
// React-key trick: when pathname changes, the boundary unmounts (clearing
// captured state) and remounts fresh, so a crash on one page doesn't follow
// the user when they navigate away.
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}
