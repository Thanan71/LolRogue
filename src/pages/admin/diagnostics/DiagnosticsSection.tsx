import type { ReactNode } from 'react';
import { getAdminDiagnosticsCopy } from '@/i18n/adminDiagnostics';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { formatAdminNumber } from '../../adminPageUtils';
import type { AdminSectionFeedback } from '../useAdminSection';

export function DiagnosticsSection({
  id,
  title,
  help,
  state,
  enabled,
  children,
}: {
  id: string;
  title: string;
  help: string;
  state: AdminSectionFeedback & { reload: () => Promise<boolean> };
  enabled: boolean;
  children: ReactNode;
}) {
  const copy = getAdminDiagnosticsCopy(locale);
  return (
    <section
      className="admin-diagnostics__panel"
      aria-labelledby={`${id}-heading`}
      aria-busy={state.loading}
    >
      <div className="admin-diagnostics__heading">
        <h3 id={`${id}-heading`} tabIndex={-1}>
          {title}
        </h3>
        <Button variant="secondary" onClick={state.reload} disabled={!enabled || state.loading}>
          {copy.refresh}
        </Button>
      </div>
      <p className="admin-diagnostics__note">{help}</p>
      {state.error && (
        <div role="alert">
          <p>{copy.failed}</p>
          <Button variant="secondary" onClick={state.reload} disabled={!enabled || state.loading}>
            {copy.retry}
          </Button>
        </div>
      )}
      {state.stale && (
        <p role="status" className="admin-diagnostics__notice">
          {copy.stale}
        </p>
      )}
      {state.loading && !state.hasData && <p role="status">{copy.loading}</p>}
      {state.hasData && children}
    </section>
  );
}
export function DiagnosticsPagination({
  section,
  page,
  total,
  displayed,
  next,
  diagnostics,
}: {
  section: 'logs' | 'authority' | 'correlation';
  page: number;
  total: number;
  displayed: number;
  next: boolean;
  diagnostics: {
    enabled: boolean;
    navigate: (
      section: 'logs' | 'authority' | 'correlation',
      direction: 'next' | 'previous',
    ) => void;
  };
}) {
  const copy = getAdminDiagnosticsCopy(locale);
  return (
    <div className="admin-diagnostics__pagination">
      <p role="status">
        {copy.displayed}: {formatAdminNumber(displayed)} · {copy.total}: {formatAdminNumber(total)}
      </p>
      <div className="admin-diagnostics__actions">
        <Button
          variant="secondary"
          disabled={!diagnostics.enabled || page === 1}
          onClick={() => diagnostics.navigate(section, 'previous')}
        >
          {copy.previous}
        </Button>
        <span>
          {copy.page} {formatAdminNumber(page)}
        </span>
        <Button
          variant="secondary"
          disabled={!diagnostics.enabled || !next}
          onClick={() => diagnostics.navigate(section, 'next')}
        >
          {copy.next}
        </Button>
      </div>
    </div>
  );
}
export function DiagnosticsTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="admin-diagnostics__scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="admin-diagnostics__table">
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}
export function diagnosticsDate(value: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value));
}
