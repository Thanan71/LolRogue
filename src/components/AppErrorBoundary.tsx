import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/utils/logger';
import { PageShell, StateView } from '@/components/ui';

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
      <PageShell width="narrow" centered>
        <StateView
          kind="error"
          title="Une erreur inattendue est survenue"
          actionLabel="Retour au menu"
          onAction={this.reset}
        >
          La partie locale est conservée. Recharge la page pour reprendre.
        </StateView>
      </PageShell>
    );
  }
}

export function RouteLoadingFallback() {
  return (
    <PageShell width="narrow" centered>
      <StateView kind="loading" title="Chargement…" />
    </PageShell>
  );
}
