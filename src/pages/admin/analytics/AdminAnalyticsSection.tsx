import type { ReactNode } from 'react';
import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { AdminSectionFeedback } from '../AdminSectionFeedback';
import type { AdminSectionFeedback as Feedback } from '../useAdminSection';

export function AdminAnalyticsSection({
  id,
  title,
  description,
  state,
  onRetry,
  children,
  disabled = false,
}: {
  id: string;
  title: string;
  description: string;
  state: Feedback;
  onRetry: () => Promise<boolean>;
  children: ReactNode;
  disabled?: boolean;
}) {
  const copy = getAdminAnalyticsCopy(locale);
  return (
    <section
      id={id}
      className="admin-analytics__panel"
      aria-labelledby={`${id}-heading`}
      aria-busy={state.loading}
    >
      <div className="admin-analytics__heading">
        <h3 id={`${id}-heading`}>{title}</h3>
        <Button variant="secondary" onClick={onRetry} disabled={disabled || state.loading}>
          {copy.refresh}
        </Button>
      </div>
      <p className="admin-analytics__note">{description}</p>
      {state.error && (
        <div role="alert">
          <p>{copy.requestFailed}</p>
          <p>{copy.requestHelp}</p>
          <Button variant="secondary" onClick={onRetry} disabled={disabled || state.loading}>
            {copy.retry}
          </Button>
        </div>
      )}
      <AdminSectionFeedback state={state} />
      {state.loading && !state.hasData && <p role="status">{copy.loading}</p>}
      {state.hasData && children}
    </section>
  );
}
