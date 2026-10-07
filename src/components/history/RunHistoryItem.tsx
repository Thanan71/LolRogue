import { useEffect, useRef, useState } from 'react';
import { StateView } from '@/components/ui';
import { riotChampionIconUrl } from '@/config/riotAssets';
import { championDB } from '@/data/championDatabase';
import { augmentName, localizeChampion, runeName } from '@/i18n/content';
import { formatDate, formatNumber } from '@/i18n/format';
import { fr, locale } from '@/i18n/fr';
import { runHistoryCopy as copy } from '@/i18n/runHistoryContent';
import type {
  IRunRepository,
  RunHistoryDetails,
  RunHistoryEntry,
} from '@/services/interfaces/IRunRepository';
import { historyComparison } from './historyComparison';

const pluralRules = new Intl.PluralRules(locale);
function plural(value: number, singular: string, multiple: string) {
  return pluralRules.select(value) === 'one' ? singular : multiple;
}
function championName(id: string) {
  const champion = championDB.getById(id);
  return champion ? localizeChampion(champion).name : id;
}

export function RunHistoryItem({
  entry,
  repository,
}: {
  entry: RunHistoryEntry;
  repository: IRunRepository;
}) {
  const [details, setDetails] = useState<RunHistoryDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const pending = useRef(false);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const load = async () => {
    if (pending.current || details) return;
    const current = ++request.current;
    pending.current = true;
    setLoading(true);
    setError(false);
    try {
      const result = await repository.getRunHistoryDetails(entry.run.id);
      if (current !== request.current) return;
      if (result.error || !result.data) {
        setError(true);
        return;
      }
      setDetails(result.data);
    } catch {
      if (current === request.current) setError(true);
    } finally {
      if (current === request.current) {
        pending.current = false;
        setLoading(false);
      }
    }
  };
  const { run: summary, attempt } = entry;
  const resultClass = summary.won ? 'victory' : 'defeat';
  return (
    <li className={`ui-list-item profile-run profile-run--${resultClass}`}>
      <details
        onToggle={(event) => {
          if (event.currentTarget.open) void load();
        }}
      >
        <summary>
          <span className="profile-run__summary">
            <span className={`profile-run__result profile-run__result--${resultClass}`}>
              {summary.won ? fr.common.victory : fr.common.defeat}
            </span>
            <span className="profile-run__headline">
              {fr.common.level} {formatNumber(summary.run_level)} ·{' '}
              {formatNumber(summary.waves_completed)}{' '}
              {plural(summary.waves_completed, fr.profile.wave, fr.profile.waves)} ·{' '}
              {formatNumber(summary.total_kills)}{' '}
              {plural(summary.total_kills, fr.profile.elimination, fr.profile.eliminations)}
            </span>
            <span className="run-history-comparison">{copy[historyComparison(entry)]}</span>
            <small>
              {formatDate(summary.completed_at ?? summary.created_at, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </small>
          </span>
        </summary>
        <dl className="ui-definition-list">
          <div>
            <dt>{fr.profile.comparisonGroup}</dt>
            <dd>
              {attempt
                ? fr.profile.comparisonDetails(
                    fr.profile.modes[attempt.mode as keyof typeof fr.profile.modes] ??
                      fr.profile.unknownMode,
                    fr.profile.difficulties[
                      attempt.difficulty as keyof typeof fr.profile.difficulties
                    ] ?? fr.profile.unknownDifficulty,
                    formatNumber(attempt.gameplayRulesetVersion),
                  )
                : fr.profile.legacyRun}
              {attempt && (
                <p>
                  {copy.versions(
                    attempt.engineVersion,
                    formatNumber(attempt.gameplayRulesetVersion),
                    formatNumber(attempt.progressionRulesetVersion),
                  )}
                </p>
              )}
            </dd>
          </div>
        </dl>
        {loading && <StateView kind="loading" title={fr.profile.loading} />}
        {error && (
          <StateView
            kind="error"
            title={copy.detailsError}
            actionLabel={copy.loadDetails}
            onAction={() => {
              void load();
            }}
          />
        )}
        {details && <RunDetails details={details} />}
      </details>
    </li>
  );
}

function RunDetails({ details: { run, teamMembers } }: { details: RunHistoryDetails }) {
  const content = [
    ...run.rune_ids.map((id) => runeName(id)),
    ...run.augment_ids.map((id) => augmentName(id, id)),
  ];
  return (
    <>
      {teamMembers.length > 0 && (
        <span className="profile-run__portraits" role="group" aria-label={fr.profile.team}>
          {teamMembers.slice(0, 5).map((member, index) => (
            <img
              key={`${member.champion_id}-${index}`}
              src={riotChampionIconUrl(member.champion_id)}
              alt={championName(member.champion_id)}
              width={40}
              height={40}
              loading="lazy"
              decoding="async"
            />
          ))}
        </span>
      )}
      <dl className="ui-definition-list">
        <div>
          <dt>{fr.profile.team}</dt>
          <dd>
            {teamMembers.length > 0
              ? teamMembers
                  .map((member) =>
                    fr.profile.teamMember(
                      championName(member.champion_id),
                      formatNumber(member.final_level),
                    ),
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
            {formatNumber(run.items_purchased)}{' '}
            {plural(run.items_purchased, fr.profile.item, fr.profile.items)}
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
            {content.length > 0 ? (
              <span className="profile-run__chips">
                {content.map((label, index) => (
                  <span key={`${label}-${index}`}>{label}</span>
                ))}
              </span>
            ) : (
              fr.profile.none
            )}
          </dd>
        </div>
      </dl>
    </>
  );
}
