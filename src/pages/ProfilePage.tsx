import { useCallback, useEffect, useState } from 'react';
import { Button, PageHeader, PageShell, Panel, StateView } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { formatDate, formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { RepositoryContainerFactory } from '@/services/container';
import type { RunHistoryEntry } from '@/services/interfaces/IRunRepository';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';

const repositories = RepositoryContainerFactory.create(supabase);

export function ProfilePage() {
  const navigate = useAppNavigate();
  const { player, isGuest } = useAuthStore();
  const [runs, setRuns] = useState<RunHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!player || isGuest) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void repositories.run.getPlayerRunHistory(player.id, 20).then((result) => {
      if (cancelled) return;
      if (result.error) setError(fr.common.unavailableError);
      else setRuns(result.data ?? []);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [player, isGuest, reloadKey]);

  return (
    <PageShell width="content">
      <PageHeader
        title={fr.profile.title}
        subtitle={fr.profile.subtitle}
        leading={
          <Button variant="ghost" onClick={() => navigate(ROUTES.MENU)}>
            {fr.common.menu}
          </Button>
        }
      />
      {isGuest || !player ? (
        <StateView kind="empty" title={fr.profile.local}>
          <p>{fr.profile.loginRequired}</p>
          <Button onClick={() => navigate(ROUTES.AUTH)}>{fr.profile.login}</Button>
        </StateView>
      ) : isLoading ? (
        <StateView kind="loading" title={fr.profile.loading}>
          {fr.profile.loadingDetail}
        </StateView>
      ) : (
        <>
          <p role="status" className="ui-status-line">
            {navigator.onLine ? fr.profile.connected : fr.profile.offline}
          </p>
          <Panel aria-label={fr.profile.playerStats}>
            <div className="profile-summary">
              <div className="profile-summary__avatar" aria-hidden="true">
                {(player.display_name || player.username).charAt(0).toUpperCase()}
              </div>
              <div>
                <h2>{player.display_name || player.username}</h2>
                <p>Ta progression synchronisée et les résultats de tes dernières expéditions.</p>
                <div className="profile-summary__stats">
                  <div className="profile-summary__stat">
                    <strong>{formatNumber(player.level)}</strong>
                    <span>{fr.common.level}</span>
                  </div>
                  <div className="profile-summary__stat">
                    <strong>{formatNumber(player.total_candies)}</strong>
                    <span>{fr.common.candies}</span>
                  </div>
                  <div className="profile-summary__stat">
                    <strong>{formatNumber(player.total_runs_completed)}</strong>
                    <span>{fr.profile.runs}</span>
                  </div>
                  <div className="profile-summary__stat">
                    <strong>{formatNumber(player.total_wins)}</strong>
                    <span>{fr.profile.wins}</span>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
          <Panel aria-label={fr.profile.history}>
            <h2>{fr.profile.recentHistory}</h2>
            {error && (
              <StateView
                kind="error"
                title={fr.profile.historyUnavailable}
                actionLabel={fr.profile.retry}
                onAction={retry}
              >
                {error}
              </StateView>
            )}
            {!error && runs.length === 0 && <StateView kind="empty" title={fr.profile.noRuns} />}
            <ul className="ui-list">
              {runs.map(({ run, attempt, teamMembers }) => (
                <li key={run.id} className="ui-list-item">
                  <details>
                    <summary>
                      <strong>{run.won ? fr.common.victory : fr.common.defeat}</strong> —{' '}
                      {fr.common.level.toLowerCase()} {formatNumber(run.run_level)},{' '}
                      {formatNumber(run.waves_completed)} {fr.profile.waves},{' '}
                      {formatNumber(run.total_kills)} {fr.profile.eliminations}
                      <br />
                      <small>
                        {formatDate(run.completed_at ?? run.created_at, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </small>
                    </summary>
                    <dl className="ui-definition-list">
                      <div>
                        <dt>{fr.profile.comparisonGroup}</dt>
                        <dd>
                          {attempt
                            ? `${attempt.mode} · ${attempt.difficulty} · gameplay v${formatNumber(attempt.gameplayRulesetVersion)}`
                            : fr.profile.legacyRun}
                        </dd>
                      </div>
                      <div>
                        <dt>{fr.profile.team}</dt>
                        <dd>
                          {teamMembers.length > 0
                            ? teamMembers
                                .map(
                                  (member) =>
                                    `${member.champion_id} niv. ${formatNumber(member.final_level)}`,
                                )
                                .join(', ')
                            : fr.profile.teamUnavailable}
                        </dd>
                      </div>
                      <div>
                        <dt>{fr.profile.economy}</dt>
                        <dd>
                          {formatNumber(run.gold_earned)} {fr.profile.goldEarned} ·{' '}
                          {formatNumber(run.total_gold_spent)} {fr.profile.goldSpent} ·{' '}
                          {formatNumber(run.items_purchased)} {fr.profile.items}
                        </dd>
                      </div>
                      <div>
                        <dt>{fr.profile.combatStats}</dt>
                        <dd>
                          {formatNumber(run.total_damage_dealt)} {fr.profile.damage} ·{' '}
                          {formatNumber(run.total_healing_done)} {fr.profile.healing} ·{' '}
                          {formatNumber(run.total_shielding_done)} {fr.profile.shielding}
                        </dd>
                      </div>
                      <div>
                        <dt>{fr.profile.content}</dt>
                        <dd>
                          {run.rune_ids.join(', ') || fr.profile.none} ·{' '}
                          {run.augment_ids.join(', ') || fr.profile.none}
                        </dd>
                      </div>
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </PageShell>
  );
}
