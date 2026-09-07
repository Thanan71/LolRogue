import { useMemo } from 'react';
import {
  compareVerifiedFieldAugmentCalibration,
  compareVerifiedFieldCalibration,
  compareVerifiedFieldChampionCalibration,
  type FieldAugmentCalibrationComparison,
  type FieldCalibrationComparison,
  type FieldChampionCalibrationComparison,
  type VerifiedFieldAugmentCohort,
  type VerifiedFieldCalibrationCohort,
  type VerifiedFieldChampionCohort,
} from '@/game/balance/fieldCalibrationComparison';
import { getAdminFieldCalibrationCopy } from '@/i18n/adminFieldCalibration';
import { locale } from '@/i18n/fr';

interface AdminFieldCalibrationPanelProps {
  fieldCohorts: readonly VerifiedFieldCalibrationCohort[];
  championCohorts: readonly VerifiedFieldChampionCohort[];
  augmentCohorts: readonly VerifiedFieldAugmentCohort[];
}

interface FieldComparisonRow {
  field: VerifiedFieldCalibrationCohort;
  comparison: FieldCalibrationComparison | null;
}

interface ChampionComparisonRow {
  field: VerifiedFieldChampionCohort;
  comparison: FieldChampionCalibrationComparison | null;
}

interface AugmentComparisonRow {
  field: VerifiedFieldAugmentCohort;
  comparison: FieldAugmentCalibrationComparison | null;
}

const copy = getAdminFieldCalibrationCopy(locale);

function percent(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function signed(value: number, digits = 1): string {
  const rounded = value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

function interval(low: number, high: number): string {
  return `[${percent(low)} ; ${percent(high)}]`;
}

function cellLabel(
  cell: Pick<
    VerifiedFieldCalibrationCohort,
    | 'gameplayRulesetVersion'
    | 'engineVersion'
    | 'difficulty'
    | 'mode'
    | 'initialTeamSize'
    | 'initialCompositionHash'
    | 'metaLevel'
    | 'runeLoadoutHash'
    | 'enhancementLoadoutHash'
  >,
): string {
  return [
    `${copy.cell.gameplay} v${cell.gameplayRulesetVersion}`,
    cell.engineVersion,
    copy.difficulty[cell.difficulty],
    copy.mode[cell.mode],
    `${copy.cell.team} ${cell.initialTeamSize}`,
    `${copy.cell.composition} ${cell.initialCompositionHash.slice(0, 10)}…`,
    `${copy.cell.meta} ${cell.metaLevel}`,
    `${copy.cell.runes} ${cell.runeLoadoutHash.slice(0, 10)}…`,
    `${copy.cell.enhancements} ${cell.enhancementLoadoutHash.slice(0, 10)}…`,
  ].join(' · ');
}

function strongestDeathDelta(comparison: FieldCalibrationComparison): string | null {
  let death: FieldCalibrationComparison['deathBiomeShares'][number] | undefined;
  for (const candidate of comparison.deathBiomeShares) {
    if (!death || Math.abs(candidate.delta) > Math.abs(death.delta)) death = candidate;
  }
  if (!death) return null;
  const biome = copy.biome[death.biome as keyof typeof copy.biome] ?? death.biome;
  return `${biome} ${signed(death.delta * 100)} ${copy.cell.points}`;
}

function noCompatibleBaseline() {
  return (
    <>
      <strong>{copy.comparison.noBaseline}</strong>
      <small>{copy.comparison.informativeOnly}</small>
    </>
  );
}

export function AdminFieldCalibrationPanel({
  fieldCohorts,
  championCohorts,
  augmentCohorts,
}: AdminFieldCalibrationPanelProps) {
  const comparisonRows = useMemo(
    () =>
      fieldCohorts.flatMap<FieldComparisonRow>((field) => {
        const comparisons = compareVerifiedFieldCalibration(field);
        return comparisons.length > 0
          ? comparisons.map((comparison) => ({ field, comparison }))
          : [{ field, comparison: null }];
      }),
    [fieldCohorts],
  );
  const championRows = useMemo(
    () =>
      championCohorts.flatMap<ChampionComparisonRow>((field) => {
        const comparisons = compareVerifiedFieldChampionCalibration(field);
        return comparisons.length > 0
          ? comparisons.map((comparison) => ({ field, comparison }))
          : [{ field, comparison: null }];
      }),
    [championCohorts],
  );
  const augmentRows = useMemo(
    () =>
      augmentCohorts.flatMap<AugmentComparisonRow>((field) => {
        const comparisons = compareVerifiedFieldAugmentCalibration(field);
        return comparisons.length > 0
          ? comparisons.map((comparison) => ({ field, comparison }))
          : [{ field, comparison: null }];
      }),
    [augmentCohorts],
  );

  return (
    <section className="field-calibration" aria-labelledby="field-calibration-title">
      <div className="authority-rejections-header">
        <div>
          <h4 id="field-calibration-title">{copy.title}</h4>
          <span>{copy.description}</span>
        </div>
      </div>

      <div className="runs-table-container">
        <table className="runs-table field-calibration-table">
          <caption className="sr-only">{copy.overallCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.columns.dateCell}</th>
              <th scope="col">{copy.columns.fieldWilson}</th>
              <th scope="col">{copy.columns.simulation}</th>
              <th scope="col">{copy.columns.deltas}</th>
              <th scope="col">{copy.columns.decision}</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map(({ field, comparison }) => {
              const deathDelta = comparison ? strongestDeathDelta(comparison) : null;
              return (
                <tr
                  key={`${field.observedOn}-${field.gameplayRulesetVersion}-${field.engineVersion}-${field.mode}-${field.initialCompositionHash}-${field.metaLevel}-${field.runeLoadoutHash}-${field.enhancementLoadoutHash}-${field.difficulty}-${comparison?.baselineKey ?? 'unmatched'}`}
                >
                  <td>
                    <strong>{field.observedOn}</strong>
                    <small>{cellLabel(field)}</small>
                  </td>
                  <td>
                    <strong>
                      {percent(field.winRate)}{' '}
                      {interval(field.winRateWilson95.lower, field.winRateWilson95.upper)}
                    </strong>
                    <small>
                      n={field.sampleSize} · {copy.cell.median}{' '}
                      {field.medianBiomesCompleted.toFixed(1)} {copy.cell.biomes} ·{' '}
                      {copy.cell.balance} {field.averageGoldBalance.toFixed(1)} {copy.cell.gold}
                    </small>
                  </td>
                  {comparison ? (
                    <>
                      <td>
                        <strong>{comparison.policy}</strong>
                        <small>
                          n={comparison.baselineSampleSize} · {percent(comparison.winRate.baseline)}{' '}
                          {interval(
                            comparison.baselineWinRateWilson95.lower,
                            comparison.baselineWinRateWilson95.upper,
                          )}
                        </small>
                      </td>
                      <td>
                        <strong>
                          {signed(comparison.winRate.delta * 100)} {copy.comparison.victoryPoints}
                        </strong>
                        <small>
                          {signed(comparison.medianBiomesCompleted.delta)} {copy.cell.biomes} ·{' '}
                          {signed(comparison.averageGoldBalance.delta)} {copy.cell.gold}
                          {deathDelta ? ` · ${copy.comparison.death} ${deathDelta}` : ''}
                        </small>
                      </td>
                      <td>
                        <strong>
                          {comparison.reviewRequired
                            ? copy.review.open
                            : copy.review.belowThresholds}
                        </strong>
                        <small>
                          {comparison.reviewSignals.length > 0
                            ? comparison.reviewSignals
                                .map((signal) => copy.review.signals[signal])
                                .join(', ')
                            : copy.review.noSignal}{' '}
                          · {copy.review.intervals}{' '}
                          {comparison.winIntervalsOverlap
                            ? copy.review.overlapping
                            : copy.review.separate}
                        </small>
                      </td>
                    </>
                  ) : (
                    <td colSpan={3}>{noCompatibleBaseline()}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {comparisonRows.length === 0 ? <div className="no-data">{copy.empty.cohorts}</div> : null}
      </div>

      <div className="field-calibration-conditionals">
        <div className="runs-table-container">
          <table className="runs-table field-calibration-table">
            <caption>{copy.champions.caption}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.columns.subjectCell}</th>
                <th scope="col">{copy.columns.fieldSample}</th>
                <th scope="col">{copy.columns.simulation}</th>
                <th scope="col">{copy.columns.conditionalPerformance}</th>
              </tr>
            </thead>
            <tbody>
              {championRows.map(({ field, comparison }) => (
                <tr
                  key={`${field.observedOn}-${field.gameplayRulesetVersion}-${field.engineVersion}-${field.mode}-${field.initialCompositionHash}-${field.metaLevel}-${field.runeLoadoutHash}-${field.enhancementLoadoutHash}-${field.difficulty}-${field.championId}-${comparison?.baselineKey ?? 'unmatched'}`}
                >
                  <td>
                    <strong>{field.championId}</strong>
                    <small>{cellLabel(field)}</small>
                  </td>
                  <td>
                    <strong>
                      {field.sampleSize}/{field.cohortSampleSize} · {copy.cell.presence}{' '}
                      {percent(field.participationRate)}
                    </strong>
                    <small>
                      {percent(field.winRate)}{' '}
                      {interval(field.winRateWilson95.lower, field.winRateWilson95.upper)}
                    </small>
                  </td>
                  {comparison ? (
                    <>
                      <td>
                        <strong>{comparison.policy}</strong>
                        <small>
                          {comparison.baselineSampleSize}/{comparison.baselineCohortSampleSize} ·{' '}
                          {copy.cell.presence} {percent(comparison.participationRate.baseline)} ·{' '}
                          {percent(comparison.winRate.baseline)}{' '}
                          {interval(
                            comparison.baselineWinRateWilson95.lower,
                            comparison.baselineWinRateWilson95.upper,
                          )}
                        </small>
                      </td>
                      <td>
                        <strong>
                          {signed(comparison.winRate.delta * 100)} {copy.comparison.victoryPoints} ·{' '}
                          {copy.cell.presence} {signed(comparison.participationRate.delta * 100)}{' '}
                          {copy.cell.points}
                        </strong>
                        <small>
                          {copy.cell.level} {signed(comparison.averageFinalLevel.delta)} ·{' '}
                          {copy.cell.killsDeaths} {signed(comparison.averageKills.delta)}/
                          {signed(comparison.averageDeaths.delta)} · {copy.cell.damage}{' '}
                          {signed(comparison.averageDamageDealt.delta, 0)} · {copy.cell.healing}{' '}
                          {signed(comparison.averageHealingDone.delta, 0)} · {copy.cell.shielding}{' '}
                          {signed(comparison.averageShieldingDone.delta, 0)} ·{' '}
                          {copy.review.intervals}{' '}
                          {comparison.winIntervalsOverlap
                            ? copy.review.overlapping
                            : copy.review.separate}
                        </small>
                      </td>
                    </>
                  ) : (
                    <td colSpan={2}>{noCompatibleBaseline()}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {championRows.length === 0 ? <div className="no-data">{copy.empty.champions}</div> : null}
        </div>

        <div className="runs-table-container">
          <table className="runs-table field-calibration-table">
            <caption>{copy.augments.caption}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.columns.subjectCell}</th>
                <th scope="col">{copy.columns.fieldSample}</th>
                <th scope="col">{copy.columns.simulation}</th>
                <th scope="col">{copy.columns.conditionalPerformance}</th>
              </tr>
            </thead>
            <tbody>
              {augmentRows.map(({ field, comparison }) => (
                <tr
                  key={`${field.observedOn}-${field.gameplayRulesetVersion}-${field.engineVersion}-${field.mode}-${field.initialCompositionHash}-${field.metaLevel}-${field.runeLoadoutHash}-${field.enhancementLoadoutHash}-${field.difficulty}-${field.augmentId}-${comparison?.baselineKey ?? 'unmatched'}`}
                >
                  <td>
                    <strong>{field.augmentId}</strong>
                    <small>{cellLabel(field)}</small>
                  </td>
                  <td>
                    <strong>
                      {field.sampleSize}/{field.cohortSampleSize} · {copy.cell.selection}{' '}
                      {percent(field.selectionRate)}
                    </strong>
                    <small>
                      {percent(field.winRate)}{' '}
                      {interval(field.winRateWilson95.lower, field.winRateWilson95.upper)}
                    </small>
                  </td>
                  {comparison ? (
                    <>
                      <td>
                        <strong>{comparison.policy}</strong>
                        <small>
                          {comparison.baselineSampleSize}/{comparison.baselineCohortSampleSize} ·{' '}
                          {copy.cell.selection} {percent(comparison.selectionRate.baseline)}
                          {comparison.baselineWinRateWilson95
                            ? ` · ${percent(comparison.winRate?.baseline ?? 0)} ${interval(
                                comparison.baselineWinRateWilson95.lower,
                                comparison.baselineWinRateWilson95.upper,
                              )}`
                            : ` · ${copy.comparison.neverSelected}`}
                        </small>
                      </td>
                      <td>
                        <strong>
                          {copy.cell.selection} {signed(comparison.selectionRate.delta * 100)}{' '}
                          {copy.cell.points}
                          {comparison.winRate
                            ? ` · ${signed(comparison.winRate.delta * 100)} ${copy.comparison.victoryPoints}`
                            : ''}
                        </strong>
                        <small>
                          {comparison.averageWavesCompleted !== null &&
                          comparison.averageBiomesCompleted !== null &&
                          comparison.averageGoldBalance !== null
                            ? `${signed(comparison.averageWavesCompleted.delta)} ${copy.cell.waves} · ${signed(comparison.averageBiomesCompleted.delta)} ${copy.cell.biomes} · ${signed(comparison.averageGoldBalance.delta)} ${copy.cell.gold} · ${copy.review.intervals} ${comparison.winIntervalsOverlap ? copy.review.overlapping : copy.review.separate}`
                            : copy.comparison.neverSelected}
                        </small>
                      </td>
                    </>
                  ) : (
                    <td colSpan={2}>{noCompatibleBaseline()}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {augmentRows.length === 0 ? <div className="no-data">{copy.empty.augments}</div> : null}
        </div>
      </div>
    </section>
  );
}
