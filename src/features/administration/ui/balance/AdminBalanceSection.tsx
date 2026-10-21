import type { ReactNode } from 'react';
import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { AdminSectionFeedback } from '../AdminSectionFeedback';
import type { AdminSectionFeedback as Feedback } from '../../hooks/useAdminSection';

export function AdminBalanceSection({
  id,
  title,
  help,
  state,
  disabled,
  children,
}: {
  id: string;
  title: string;
  help: string;
  state: Feedback & { reload: () => Promise<boolean> };
  disabled: boolean;
  children: ReactNode;
}) {
  const copy = getAdminBalanceCopy(locale);
  return (
    <section
      id={id}
      className="admin-balance__panel"
      aria-labelledby={`${id}-heading`}
      aria-busy={state.loading}
    >
      <div className="admin-balance__heading">
        <h3 id={`${id}-heading`}>{title}</h3>
        <Button variant="secondary" onClick={state.reload} disabled={disabled || state.loading}>
          {copy.refresh}
        </Button>
      </div>
      <p className="admin-balance__note">{help}</p>
      {state.error && (
        <div role="alert">
          <p>{copy.failed}</p>
          <Button variant="secondary" onClick={state.reload} disabled={disabled || state.loading}>
            {copy.retry}
          </Button>
        </div>
      )}
      <AdminSectionFeedback state={state} />
      {state.loading && !state.hasData && <p role="status">{copy.loading}</p>}
      {state.status === 'empty' && <p role="status">{copy.empty}</p>}
      {state.hasData && children}
    </section>
  );
}
