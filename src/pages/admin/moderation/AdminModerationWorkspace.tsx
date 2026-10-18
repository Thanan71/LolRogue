import { getAdminModerationCopy } from '@/i18n/adminModeration';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { ModerationCase } from './ModerationCase';
import { ModerationDecisionReceipt } from './ModerationDecisionReceipt';
import { ModerationFilters } from './ModerationFilters';
import { ModerationQueue } from './ModerationQueue';
import { useAdminModeration } from './useAdminModeration';
import '@/styles/admin-moderation.css';

export default function AdminModerationWorkspace({ active = true }: { active?: boolean }) {
  const moderation = useAdminModeration(active);
  const copy = getAdminModerationCopy(locale);
  return (
    <section
      role="tabpanel"
      id="admin-panel-moderation"
      aria-labelledby="admin-tab-moderation"
      className="admin-moderation"
    >
      <div className="admin-moderation__heading">
        <h2>{copy.title}</h2>
        <Button
          disabled={!moderation.enabled || moderation.queue.loading || moderation.decision.locked}
          onClick={moderation.refresh}
        >
          {copy.refresh}
        </Button>
      </div>
      <p>{copy.intro}</p>
      {moderation.permissionDenied ? (
        <p role="alert">{copy.denied}</p>
      ) : (
        <>
          <ModerationFilters moderation={moderation} copy={copy} />
          <ModerationDecisionReceipt moderation={moderation} copy={copy} />
          <ModerationQueue moderation={moderation} copy={copy} />
          <ModerationCase moderation={moderation} copy={copy} />
        </>
      )}
    </section>
  );
}
