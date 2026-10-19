import {
  analyticsArray,
  analyticsBoolean,
  analyticsRecord,
  analyticsText,
  analyticsTimestamp,
  analyticsTimestampUs,
} from '../analytics/adminAnalyticsValidation';
import {
  balanceEngine,
  balanceHash,
  balanceLiteral,
  balanceVersion,
  invalidBalance,
} from './adminBalanceValidation';
import type {
  BalanceConfig,
  BalanceGameplayRuleset,
  BalanceProgressionRuleset,
} from './balanceTypes';

function validateRulesets(rows: BalanceProgressionRuleset[]): void {
  if (
    new Set(rows.map((row) => row.version)).size !== rows.length ||
    new Set(rows.map((row) => row.code)).size !== rows.length ||
    rows.filter((row) => row.active).length > 1
  )
    invalidBalance();
}

export function parseAdminBalanceConfig(value: unknown): BalanceConfig {
  const row = analyticsRecord(value, [
    'snapshotAt',
    'readOnly',
    'gameplayRulesets',
    'progressionRulesets',
    'championEconomy',
    'trees',
    'unsupportedMetrics',
    'minimumSampleSize',
  ]);
  const snapshotAt = analyticsTimestamp(row.snapshotAt);
  const snapshotUs = analyticsTimestampUs(snapshotAt);
  if (row.readOnly !== true || row.minimumSampleSize !== 30) return invalidBalance();
  const gameplayRulesets: BalanceGameplayRuleset[] = analyticsArray(row.gameplayRulesets, 128).map(
    (value) => {
      const item = analyticsRecord(value, [
        'version',
        'code',
        'engineVersion',
        'commandVersion',
        'contentHash',
        'active',
      ]);
      return {
        version: balanceVersion(item.version),
        code: analyticsText(item.code, 128),
        engineVersion: balanceEngine(item.engineVersion),
        commandVersion: balanceVersion(item.commandVersion),
        contentHash: balanceHash(item.contentHash),
        active: analyticsBoolean(item.active),
      };
    },
  );
  const progressionRulesets: BalanceProgressionRuleset[] = analyticsArray(
    row.progressionRulesets,
    128,
  ).map((value) => {
    const item = analyticsRecord(value, ['version', 'code', 'active']);
    return {
      version: balanceVersion(item.version),
      code: analyticsText(item.code, 128),
      active: analyticsBoolean(item.active),
    };
  });
  validateRulesets(gameplayRulesets);
  validateRulesets(progressionRulesets);
  let championEconomy: BalanceConfig['championEconomy'] = null;
  if (row.championEconomy !== null) {
    const item = analyticsRecord(row.championEconomy, [
      'enabled',
      'economyVersion',
      'catalogVersion',
      'gameplayVersion',
      'activatedAt',
      'updatedAt',
    ]);
    championEconomy = {
      enabled: analyticsBoolean(item.enabled),
      economyVersion: balanceVersion(item.economyVersion),
      catalogVersion: balanceVersion(item.catalogVersion),
      gameplayVersion: balanceVersion(item.gameplayVersion),
      activatedAt: item.activatedAt === null ? null : analyticsTimestamp(item.activatedAt),
      updatedAt: analyticsTimestamp(item.updatedAt),
    };
    if (
      analyticsTimestampUs(championEconomy.updatedAt) > snapshotUs ||
      (championEconomy.activatedAt !== null &&
        analyticsTimestampUs(championEconomy.activatedAt) > snapshotUs)
    )
      return invalidBalance();
  }
  const trees = analyticsRecord(row.trees, ['status', 'dependency']);
  const unsupported = analyticsArray(row.unsupportedMetrics, 3);
  if (
    JSON.stringify(unsupported) !==
    JSON.stringify(['dps', 'crowd_control_duration', 'item_exposure'])
  )
    return invalidBalance();
  return {
    snapshotAt,
    readOnly: true,
    gameplayRulesets,
    progressionRulesets,
    championEconomy,
    trees: {
      status: balanceLiteral(trees.status, 'dependency_unavailable'),
      dependency: balanceLiteral(trees.dependency, 'TREE-10'),
    },
    unsupportedMetrics: ['dps', 'crowd_control_duration', 'item_exposure'],
    minimumSampleSize: 30,
  };
}
