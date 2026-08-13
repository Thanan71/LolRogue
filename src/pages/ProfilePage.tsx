import { useCallback, useEffect, useState } from 'react';
import { Button, PageHeader, PageShell, Panel, StateView } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { riotChampionIconUrl } from '@/config/riotAssets';
import { getAugmentDefinition, getRuneDefinition } from '@/data/items';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { formatDate, formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { runeNameFr } from '@/i18n/runes.fr';
import { RepositoryContainerFactory } from '@/services/container';
import type { RunHistoryEntry } from '@/services/interfaces/IRunRepository';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';

const repositories = RepositoryContainerFactory.create(supabase);

export function ProfilePage() {
  const navigate = useAppNavigate();
  const player = useAuthStore((state) => state.player);
  const isGuest = useAuthStore((state) => state.isGuest);
  const [runs, setRuns] = useState<RunHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const isOnline = useOnlineStatus();
  const playerId = player?.id;

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!playerId || isGuest) {
      setRuns([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setRuns([]);
    setIsLoading(true);
    setError(null);
    void repositories.run.getPlayerRunHistory(playerId, 20).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setRuns([]);
        setError(fr.common.unavailableError);
      } else {
        setRuns(result.data ?? []);
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [playerId, isGuest, reloadKey]);

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
          <p
            role="status"
            className={`ui-status-line ui-status-line--${isOnline ? 'online' : 'offline'}`}
          >
            {isOnline ? fr.profile.connected : fr.profile.offline}
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
              {runs.map(({ run, attempt, teamMembers }) => {
                const contentLabels = [
                  ...run.rune_ids.map((id) => runeNameFr(id, getRuneDefinition(id)?.name ?? id)),
                  ...run.augment_ids.map((id) => getAugmentDefinition(id)?.name ?? id),
                ];
                return (
                  <li
                    key={run.id}
                    className={`ui-list-item profile-run profile-run--${run.won ? 'victory' : 'defeat'}`}
                  >
                    <details>
                      <summary>
                        <span className="profile-run__summary">
                          <span
                            className={`profile-run__result profile-run__result--${run.won ? 'victory' : 'defeat'}`}
                          >
                            {run.won ? fr.common.victory : fr.common.defeat}
                          </span>
                          <span className="profile-run__headline">
                            {fr.common.level} {formatNumber(run.run_level)} ·{' '}
                            {formatNumber(run.waves_completed)} {fr.profile.waves} ·{' '}
                            {formatNumber(run.total_kills)} {fr.profile.eliminations}
                          </span>
                          <small>
                            {formatDate(run.completed_at ?? run.created_at, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </small>
                        </span>
                        {teamMembers.length > 0 && (
                          <span
                            className="profile-run__portraits"
                            role="group"
                            aria-label={fr.profile.team}
                          >
                            {teamMembers.slice(0, 5).map((member, index) => (
                              <img
                                key={`${member.champion_id}-${index}`}
                                src={riotChampionIconUrl(member.champion_id)}
                                alt={member.champion_id}
                                width={40}
                                height={40}
                                loading="lazy"
                                decoding="async"
                              />
                            ))}
                          </span>
                        )}
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
                            {contentLabels.length > 0 ? (
                              <span className="profile-run__chips">
                                {contentLabels.map((label, index) => (
                                  <span key={`${label}-${index}`}>{label}</span>
                                ))}
                              </span>
                            ) : (
                              fr.profile.none
                            )}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </>
      )}
    </PageShell>
  );
}
