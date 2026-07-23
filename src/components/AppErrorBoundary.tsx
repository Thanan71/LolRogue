import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('[AppErrorBoundary] Unhandled render error', {
      error,
      componentStack: info.componentStack,
    });
  }

  private reset = (): void => {
    this.setState({ error: null });
    window.location.assign('/');
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="app-error" role="alert">
        <h1>Une erreur inattendue est survenue</h1>
        <p>La partie locale est conservée. Recharge la page pour reprendre.</p>
        <button type="button" onClick={this.reset}>
          Retour au menu
        </button>
      </main>
    );
  }
}

export function RouteLoadingFallback() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      Chargement…
    </div>
  );
}
