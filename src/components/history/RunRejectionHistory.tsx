import { useEffect, useRef, useState } from 'react';
import { Button, Panel, StateView } from '@/components/ui';
import { formatDate, formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { verificationRejectionMessage } from '@/i18n/runErrorContent';
import { runHistoryCopy as copy } from '@/i18n/runHistoryContent';
import type {
  IRunRepository,
  RunRejectionCursor,
  RunRejectionEntry,
} from '@/services/interfaces/IRunRepository';

export function RunRejectionHistory({
  playerId,
  repository,
}: {
  playerId: string;
  repository: IRunRepository;
}) {
  const [entries, setEntries] = useState<RunRejectionEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<RunRejectionCursor | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  const load = async (cursor?: RunRejectionCursor) => {
    const current = ++request.current;
    setLoading(true);
    setError(false);
    try {
      const result = await repository.getPlayerRunRejections(playerId, 20, cursor);
      if (current !== request.current) return;
      if (result.error) {
        setError(true);
        return;
      }
      setEntries((previous) =>
        cursor ? [...previous, ...(result.data ?? [])] : (result.data ?? []),
      );
      setNextCursor(result.nextCursor);
      setLoaded(true);
    } catch {
      if (current === request.current) setError(true);
    } finally {
      if (current === request.current) setLoading(false);
    }
  };

  return (
    <Panel aria-label={copy.rejected}>
      <h2>{copy.rejected}</h2>
      {!loaded && (
        <Button
          disabled={loading}
          onClick={() => {
            void load();
          }}
        >
          {copy.showRejected}
        </Button>
      )}
      {loading && <StateView kind="loading" title={fr.profile.loading} />}
      {error && (
        <StateView
          kind="error"
          title={copy.rejectedError}
          actionLabel={fr.profile.retry}
          onAction={() => {
            void load(nextCursor ?? undefined);
          }}
        />
      )}
      {loaded && !loading && !error && entries.length === 0 && (
        <StateView kind="empty" title={copy.noRejected} />
      )}
      <ul className="ui-list">
        {entries.map((entry) => (
          <li key={entry.attemptId} className="ui-list-item">
            <details>
              <summary>
                {formatDate(entry.rejectedAt, { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                {copy.rejected}
              </summary>
              <p>{verificationRejectionMessage(entry.rejectionCode, null)}</p>
              <details>
                <summary>{copy.rejectionDetail}</summary>
                <dl className="ui-definition-list">
                  <div>
                    <dt>{copy.attemptId}</dt>
                    <dd>{entry.attemptId}</dd>
                  </div>
                  <div>
                    <dt>{copy.rejectionCode}</dt>
                    <dd>
                      <code>{entry.rejectionCode}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>{fr.profile.comparisonGroup}</dt>
                    <dd>
                      {copy.versions(
                        entry.engineVersion,
                        formatNumber(entry.gameplayRulesetVersion),
                        formatNumber(entry.progressionRulesetVersion),
                      )}
                    </dd>
                  </div>
                </dl>
              </details>
            </details>
          </li>
        ))}
      </ul>
      {nextCursor && (
        <Button
          disabled={loading}
          onClick={() => {
            void load(nextCursor);
          }}
        >
          {copy.next}
        </Button>
      )}
    </Panel>
  );
}
