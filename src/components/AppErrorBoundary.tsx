import { Component, type ErrorInfo, type ReactNode } from 'react';
import { PageShell, StateView } from '@/components/ui';
import { fr } from '@/i18n/fr';
import { logger } from '@/utils/logger';
import { recordTechnicalEvent } from '@/utils/observability';

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
    recordTechnicalEvent({
      type: 'frontend_error',
      source: 'react_error_boundary',
      message: error.message,
    });
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
          title={fr.system.unexpectedError}
          actionLabel={fr.common.backToMenu}
          onAction={this.reset}
        >
          {fr.system.localRunPreserved}
        </StateView>
      </PageShell>
    );
  }
}

export function RouteLoadingFallback() {
  return (
    <PageShell width="narrow" centered>
      <StateView kind="loading" title={fr.common.loading} />
    </PageShell>
  );
}
