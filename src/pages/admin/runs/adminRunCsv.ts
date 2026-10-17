import { getAdminExportContent } from '@/i18n/adminExportContent';
import { getAdminRunExplorerCopy } from '@/i18n/adminRunExplorer';
import { championContent } from '@/i18n/championContent';
import type { Locale } from '@/i18n/fr';
import { buildAdminExplorerCsv } from './adminRunExport';
import type { AdminRunPopulation } from './adminRunFilters';
import type { AdminRunListItem } from './adminRunQueries';
import { isAdminSavedRun } from './adminRunQueries';

export function buildAdminRunExplorerCsv(
  items: readonly AdminRunListItem[],
  population: AdminRunPopulation,
  locale: Locale,
): string {
  const copy = getAdminRunExplorerCopy(locale);
  const content = getAdminExportContent(locale);
  const champion = (id: string) => championContent[locale][id]?.name ?? id;
  if (population === 'attempts') {
    return buildAdminExplorerCsv(
      [
        copy.playerColumn,
        copy.status,
        copy.first,
        copy.last,
        copy.difficulty,
        copy.mode,
        copy.engine,
        copy.gameplay,
        copy.progression,
        copy.rejection,
        copy.team,
      ],
      items.map((item) => {
        if (isAdminSavedRun(item)) throw new Error('Invalid attempt export population.');
        return [
          item.displayName ?? item.username,
          copy[item.status],
          item.startedAt,
          item.finishedAt,
          item.difficulty,
          item.mode,
          item.engineVersion,
          item.gameplayVersion,
          item.progressionVersion,
          item.rejectionCode,
          item.initialTeam.map(champion).join('; '),
        ];
      }),
    );
  }
  return buildAdminExplorerCsv(
    [
      ...content.headers,
      copy.verification,
      copy.engine,
      copy.gameplay,
      copy.progression,
      copy.ledger,
      copy.difficulty,
      copy.mode,
    ],
    items.map((item) => {
      if (!isAdminSavedRun(item)) throw new Error('Invalid saved run export population.');
      const details = item.team
        .map((member) => {
          const labels = content.championDetails;
          const pair = (label: string, value: unknown) =>
            `${label}${labels.labelSeparator}${value}`;
          return [
            `${champion(member.championId)}${labels.nameSeparator}${labels.level} ${member.finalLevel}`,
            pair(labels.survived, member.survived ? content.yes : content.no),
            pair(labels.kills, member.kills),
            pair(labels.damageDealt, member.damageDealt),
            pair(labels.damageReceived, member.damageReceived),
            pair(labels.healingDone, member.healingDone),
            pair(labels.finalHealth, member.finalHp),
          ].join(' · ');
        })
        .join(' | ');
      return [
        item.runUuid,
        item.seed ?? '',
        item.username,
        item.displayName ?? item.username,
        item.won ? content.yes : content.no,
        item.runLevel,
        item.wavesCompleted,
        item.biomesVisited
          .map((biome) => content.biomes[biome as keyof typeof content.biomes] ?? biome)
          .join('; '),
        item.nodesCompleted,
        item.combatsWon,
        item.combatsLost,
        item.eliteKills,
        item.bossKills,
        item.goldEarned,
        item.totalGoldSpent,
        item.totalKills,
        item.totalDamageDealt,
        item.totalDamageReceived,
        item.totalHealingDone,
        item.totalHealingReceived,
        item.candiesEarned,
        item.durationSeconds ?? '',
        item.startedAt,
        item.completedAt,
        item.championsRecruited,
        item.itemsPurchased,
        item.team.map((member) => champion(member.championId)).join('; '),
        details,
        item.verificationStatus === 'verified' ? copy.verified : copy.legacy,
        item.engineVersion,
        item.gameplayVersion,
        item.progressionVersion,
        item.ledgerVersion,
        item.difficulty,
        item.mode,
      ];
    }),
  );
}
