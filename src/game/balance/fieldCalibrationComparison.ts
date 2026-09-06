import type { AuthorityDifficulty } from '@/game/authority/types';
import { BALANCE_CALIBRATION_DECISION } from '@/product/balanceCalibrationDecision';
import fieldBaselineJson from '../../../config/authority-field-calibration-baseline-v1.json';
import fieldConditionalsJson from '../../../config/authority-field-calibration-conditionals-v1.json';
import {
  type AuthorityCohortBaselineReport,
  loadAuthorityCohortBaseline,
} from './authorityCohortBaseline';
import {
  type AuthorityCohortWilsonInterval,
  calculateWilsonInterval95,
} from './authorityCohortReport';
import {
  type AuthorityFieldConditionalReport,
  loadAuthorityFieldCalibrationConditionalsV1,
} from './authorityFieldCalibrationConditionalsV1';

export const SOLO_GAREN_COMPOSITION_HASH =
  'a5302e2442a975c4c6c63da00bdb7388ce6efb3f84c2b669cf04064d4b8a37fe' as const;
export const EMPTY_RUNE_LOADOUT_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' as const;
export const EMPTY_ENHANCEMENT_LOADOUT_HASH =
  '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' as const;

const FIELD_BASELINE = loadAuthorityCohortBaseline(fieldBaselineJson);
const FIELD_CONDITIONALS = loadAuthorityFieldCalibrationConditionalsV1(fieldConditionalsJson);

export interface VerifiedFieldCalibrationCohort {
  readonly observedOn: string;
  readonly gameplayRulesetVersion: number;
  readonly engineVersion: string;
  readonly gameplayContentHash: string;
  readonly difficulty: AuthorityDifficulty;
  readonly mode: 'normal' | 'daily';
  readonly initialTeamSize: number;
  readonly initialCompositionHash: string;
  readonly metaLevel: number;
  readonly runeLoadoutHash: string;
  readonly enhancementLoadoutHash: string;
  readonly sampleSize: number;
  readonly wins: number;
  readonly defeats: number;
  readonly winRate: number;
  readonly winRateWilson95: AuthorityCohortWilsonInterval;
  readonly averageWavesCompleted: number;
  readonly medianWavesCompleted: number;
  readonly averageBiomesCompleted: number;
  readonly medianBiomesCompleted: number;
  readonly averageGoldEarned: number;
  readonly averageGoldSpent: number;
  readonly averageGoldBalance: number;
  readonly deathBiomeCounts: Readonly<Record<string, number>>;
}

export interface VerifiedFieldChampionCohort {
  readonly observedOn: string;
  readonly gameplayRulesetVersion: number;
  readonly engineVersion: string;
  readonly gameplayContentHash: string;
  readonly difficulty: AuthorityDifficulty;
  readonly mode: 'normal' | 'daily';
  readonly initialTeamSize: number;
  readonly initialCompositionHash: string;
  readonly metaLevel: number;
  readonly runeLoadoutHash: string;
  readonly enhancementLoadoutHash: string;
  readonly championId: string;
  readonly cohortSampleSize: number;
  readonly sampleSize: number;
  readonly participationRate: number;
  readonly winRate: number;
  readonly winRateWilson95: AuthorityCohortWilsonInterval;
  readonly averageFinalLevel: number;
  readonly averageKills: number;
  readonly averageDeaths: number;
  readonly averageDamageDealt: number;
  readonly averageHealingDone: number;
  readonly averageShieldingDone: number;
}

export interface VerifiedFieldAugmentCohort {
  readonly observedOn: string;
  readonly gameplayRulesetVersion: number;
  readonly engineVersion: string;
  readonly gameplayContentHash: string;
  readonly difficulty: AuthorityDifficulty;
  readonly mode: 'normal' | 'daily';
  readonly initialTeamSize: number;
  readonly initialCompositionHash: string;
  readonly metaLevel: number;
  readonly runeLoadoutHash: string;
  readonly enhancementLoadoutHash: string;
  readonly augmentId: string;
  readonly cohortSampleSize: number;
  readonly sampleSize: number;
  readonly selectionRate: number;
  readonly winRate: number;
  readonly winRateWilson95: AuthorityCohortWilsonInterval;
  readonly averageWavesCompleted: number;
  readonly averageBiomesCompleted: number;
  readonly averageGoldBalance: number;
}

export interface FieldCalibrationDelta {
  readonly baseline: number;
  readonly field: number;
  readonly delta: number;
}

export interface FieldCalibrationDeathBiomeDelta extends FieldCalibrationDelta {
  readonly biome: string;
}

export interface FieldCalibrationComparison {
  readonly baselineKey: string;
  readonly policy: string;
  readonly baselineSampleSize: number;
  readonly baselineWinRateWilson95: AuthorityCohortWilsonInterval;
  readonly winIntervalsOverlap: boolean;
  readonly winRate: FieldCalibrationDelta;
  readonly defeatRate: FieldCalibrationDelta;
  readonly medianBiomesCompleted: FieldCalibrationDelta;
  readonly averageGoldBalance: FieldCalibrationDelta;
  readonly deathBiomeShares: readonly FieldCalibrationDeathBiomeDelta[];
  readonly reviewSignals: readonly ('win_rate' | 'biomes_completed' | 'gold_balance')[];
  readonly reviewRequired: boolean;
}

export interface FieldChampionCalibrationComparison {
  readonly baselineKey: string;
  readonly policy: string;
  readonly baselineCohortSampleSize: number;
  readonly baselineSampleSize: number;
  readonly baselineWinRateWilson95: AuthorityCohortWilsonInterval;
  readonly winIntervalsOverlap: boolean;
  readonly participationRate: FieldCalibrationDelta;
  readonly winRate: FieldCalibrationDelta;
  readonly averageFinalLevel: FieldCalibrationDelta;
  readonly averageKills: FieldCalibrationDelta;
  readonly averageDeaths: FieldCalibrationDelta;
  readonly averageDamageDealt: FieldCalibrationDelta;
  readonly averageHealingDone: FieldCalibrationDelta;
  readonly averageShieldingDone: FieldCalibrationDelta;
}

export interface FieldAugmentCalibrationComparison {
  readonly baselineKey: string;
  readonly policy: string;
  readonly baselineCohortSampleSize: number;
  readonly baselineSampleSize: number;
  readonly baselineWinRateWilson95: AuthorityCohortWilsonInterval | null;
  readonly winIntervalsOverlap: boolean | null;
  readonly selectionRate: FieldCalibrationDelta;
  readonly winRate: FieldCalibrationDelta | null;
  readonly averageWavesCompleted: FieldCalibrationDelta | null;
  readonly averageBiomesCompleted: FieldCalibrationDelta | null;
  readonly averageGoldBalance: FieldCalibrationDelta | null;
}

function intervalsOverlap(
  left: AuthorityCohortWilsonInterval,
  right: AuthorityCohortWilsonInterval,
): boolean {
  return left.lower <= right.upper && right.lower <= left.upper;
}

function delta(baseline: number, field: number): FieldCalibrationDelta {
  return { baseline, field, delta: field - baseline };
}

function scenarioFields(scenarioId: string): Readonly<Record<string, string>> {
  return Object.fromEntries(
    scenarioId.split('|').flatMap((part) => {
      const separator = part.indexOf('=');
      return separator < 1 ? [] : [[part.slice(0, separator), part.slice(separator + 1)]];
    }),
  );
}

type FieldCalibrationDimensions = Pick<
  VerifiedFieldCalibrationCohort,
  | 'gameplayRulesetVersion'
  | 'engineVersion'
  | 'gameplayContentHash'
  | 'difficulty'
  | 'mode'
  | 'initialTeamSize'
  | 'initialCompositionHash'
  | 'metaLevel'
  | 'runeLoadoutHash'
  | 'enhancementLoadoutHash'
>;

interface CompatibleAuthorityCell {
  readonly baselineKey: string;
  readonly policy: string;
  readonly report: AuthorityCohortBaselineReport;
  readonly conditionals: AuthorityFieldConditionalReport | null;
}

function hasCompatibleDimensions(field: FieldCalibrationDimensions): boolean {
  return (
    field.gameplayRulesetVersion ===
      BALANCE_CALIBRATION_DECISION.authority.gameplayRulesetVersion &&
    field.mode === 'normal' &&
    field.initialTeamSize === 1 &&
    field.initialCompositionHash === SOLO_GAREN_COMPOSITION_HASH &&
    field.metaLevel === 0 &&
    field.runeLoadoutHash === EMPTY_RUNE_LOADOUT_HASH &&
    field.enhancementLoadoutHash === EMPTY_ENHANCEMENT_LOADOUT_HASH
  );
}

function compatibleAuthorityCells(
  field: FieldCalibrationDimensions,
): readonly CompatibleAuthorityCell[] {
  if (!hasCompatibleDimensions(field)) return [];
  return BALANCE_CALIBRATION_DECISION.authority.baselineKeys.flatMap((baselineKey) => {
    const entry = FIELD_BASELINE.entries[baselineKey];
    if (
      !entry ||
      entry.identity.engineVersion !== field.engineVersion ||
      entry.identity.contentHash !== field.gameplayContentHash
    ) {
      return [];
    }
    const report = entry.reports.find((candidate) => {
      const scenario = scenarioFields(candidate.scenarioId);
      return (
        scenario.difficulty === field.difficulty &&
        scenario.team === 'solo-garen' &&
        scenario.size === '1' &&
        scenario.mastery === 'none' &&
        scenario.runes === 'none' &&
        scenario.enhancements === 'none'
      );
    });
    if (!report) return [];
    return [
      {
        baselineKey,
        policy: `${entry.identity.policy.id}@${entry.identity.policy.version}`,
        report,
        conditionals:
          FIELD_CONDITIONALS.entries[baselineKey]?.reports.find(
            (candidate) => candidate.scenarioId === report.scenarioId,
          ) ?? null,
      },
    ];
  });
}

function deathBiomeDeltas(
  field: VerifiedFieldCalibrationCohort,
  baselineLocations: readonly { biome: string; share: number }[],
): readonly FieldCalibrationDeathBiomeDelta[] {
  const baselineShares = new Map<string, number>();
  for (const location of baselineLocations) {
    baselineShares.set(location.biome, (baselineShares.get(location.biome) ?? 0) + location.share);
  }
  const fieldDivisor = field.defeats > 0 ? field.defeats : 1;
  const biomes = new Set([...baselineShares.keys(), ...Object.keys(field.deathBiomeCounts)]);
  return [...biomes]
    .sort((left, right) => left.localeCompare(right))
    .map((biome) => {
      const baseline = baselineShares.get(biome) ?? 0;
      const fieldShare = (field.deathBiomeCounts[biome] ?? 0) / fieldDivisor;
      return { biome, ...delta(baseline, fieldShare) };
    });
}

/**
 * Compares one exact terrain cell with every compatible published policy.
 * An empty result means that no versioned simulation has identical dimensions.
 */
export function compareVerifiedFieldCalibration(
  field: VerifiedFieldCalibrationCohort,
): readonly FieldCalibrationComparison[] {
  if (
    field.sampleSize <
    BALANCE_CALIBRATION_DECISION.evidence.verifiedField.minimumCompatibleSampleSize
  ) {
    return [];
  }
  return compatibleAuthorityCells(field).map(({ baselineKey, policy, report }) => {
    const baselineWins = Math.round(report.metrics['outcome.winRate'] * report.sampleSize);
    const baselineWilson = calculateWilsonInterval95(baselineWins, report.sampleSize);
    const winRate = delta(report.metrics['outcome.winRate'], field.winRate);
    const medianBiomes = delta(
      report.metrics['progression.biomes.p50'],
      field.medianBiomesCompleted,
    );
    const goldBalance = delta(report.metrics['economy.finalGold.mean'], field.averageGoldBalance);
    const reviewSignals: Array<'win_rate' | 'biomes_completed' | 'gold_balance'> = [];
    if (
      Math.abs(winRate.delta * 100) >=
      BALANCE_CALIBRATION_DECISION.reviewThresholds.absoluteWinRatePoints
    ) {
      reviewSignals.push('win_rate');
    }
    if (
      Math.abs(medianBiomes.delta) >=
      BALANCE_CALIBRATION_DECISION.reviewThresholds.absoluteAverageBiomes
    ) {
      reviewSignals.push('biomes_completed');
    }
    if (
      Math.abs(goldBalance.delta) >=
      BALANCE_CALIBRATION_DECISION.reviewThresholds.absoluteAverageGoldBalance
    ) {
      reviewSignals.push('gold_balance');
    }

    return {
      baselineKey,
      policy,
      baselineSampleSize: report.sampleSize,
      baselineWinRateWilson95: baselineWilson,
      winIntervalsOverlap: intervalsOverlap(field.winRateWilson95, baselineWilson),
      winRate,
      defeatRate: delta(report.metrics['deaths.rate'], field.defeats / field.sampleSize),
      medianBiomesCompleted: medianBiomes,
      averageGoldBalance: goldBalance,
      deathBiomeShares: deathBiomeDeltas(field, report.deathLocations),
      reviewSignals,
      reviewRequired: reviewSignals.length > 0,
    };
  });
}

export function compareVerifiedFieldChampionCalibration(
  field: VerifiedFieldChampionCohort,
): readonly FieldChampionCalibrationComparison[] {
  const minimum = BALANCE_CALIBRATION_DECISION.evidence.verifiedField.minimumCompatibleSampleSize;
  if (field.cohortSampleSize < minimum || field.sampleSize < minimum) return [];
  return compatibleAuthorityCells(field).flatMap(({ baselineKey, policy, conditionals }) => {
    const baseline = conditionals?.championCohorts.find(
      (candidate) => candidate.championId === field.championId,
    );
    if (!baseline) return [];
    return [
      {
        baselineKey,
        policy,
        baselineCohortSampleSize: baseline.cohortSampleSize,
        baselineSampleSize: baseline.sampleSize,
        baselineWinRateWilson95: baseline.winRateWilson95,
        winIntervalsOverlap: intervalsOverlap(field.winRateWilson95, baseline.winRateWilson95),
        participationRate: delta(baseline.participationRate, field.participationRate),
        winRate: delta(baseline.winRate, field.winRate),
        averageFinalLevel: delta(baseline.averageFinalLevel, field.averageFinalLevel),
        averageKills: delta(baseline.averageKills, field.averageKills),
        averageDeaths: delta(baseline.averageDeaths, field.averageDeaths),
        averageDamageDealt: delta(baseline.averageDamageDealt, field.averageDamageDealt),
        averageHealingDone: delta(baseline.averageHealingDone, field.averageHealingDone),
        averageShieldingDone: delta(baseline.averageShieldingDone, field.averageShieldingDone),
      },
    ];
  });
}

export function compareVerifiedFieldAugmentCalibration(
  field: VerifiedFieldAugmentCohort,
): readonly FieldAugmentCalibrationComparison[] {
  const minimum = BALANCE_CALIBRATION_DECISION.evidence.verifiedField.minimumCompatibleSampleSize;
  if (field.cohortSampleSize < minimum || field.sampleSize < minimum) return [];
  return compatibleAuthorityCells(field).map(({ baselineKey, policy, report, conditionals }) => {
    const baseline = conditionals?.augmentCohorts.find(
      (candidate) => candidate.augmentId === field.augmentId,
    );
    return {
      baselineKey,
      policy,
      baselineCohortSampleSize: report.sampleSize,
      baselineSampleSize: baseline?.sampleSize ?? 0,
      baselineWinRateWilson95: baseline?.winRateWilson95 ?? null,
      winIntervalsOverlap: baseline
        ? intervalsOverlap(field.winRateWilson95, baseline.winRateWilson95)
        : null,
      selectionRate: delta(baseline?.selectionRate ?? 0, field.selectionRate),
      winRate: baseline ? delta(baseline.winRate, field.winRate) : null,
      averageWavesCompleted: baseline
        ? delta(baseline.averageWavesCompleted, field.averageWavesCompleted)
        : null,
      averageBiomesCompleted: baseline
        ? delta(baseline.averageBiomesCompleted, field.averageBiomesCompleted)
        : null,
      averageGoldBalance: baseline
        ? delta(baseline.averageGoldBalance, field.averageGoldBalance)
        : null,
    };
  });
}
