import { useId, useMemo, useState } from 'react';
import { championDB } from '@/data/championDatabase';
import { formatStatValue } from '@/game/stats/statContract';
import { itemName } from '@/i18n/content';
import { fr, locale } from '@/i18n/fr';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import { type InventoryEntry, MAX_ITEMS_PER_CHAMPION, type TeamMember } from '@/types/run';
import type { CalculatedStats } from '@/utils/champion';
import { calculateFullStats } from '@/utils/statCalculator';
import { formatXpDisplay, getXpProgress } from '@/utils/xpSystem';
import '@/styles/run-team-stats.css';

interface RunTeamStatsPanelProps {
  team: TeamMember[];
  inventory: InventoryEntry[];
}

interface ChampionSheet {
  member: TeamMember;
  name: string;
  iconUrl: string | undefined;
  level: number;
  currentHp: number;
  stats: CalculatedStats;
  xpDisplay: string;
  xpProgress: number;
  items: InventoryEntry[];
}

const DETAIL_STATS = [
  {
    key: 'attackDamage',
    label: fr.run.detailStats.attackDamage,
    shortLabel: fr.stats.short.attackDamage,
  },
  {
    key: 'abilityPower',
    label: fr.run.detailStats.abilityPower,
    shortLabel: fr.stats.short.abilityPower,
  },
  { key: 'armor', label: fr.run.detailStats.armor, shortLabel: fr.stats.short.armor },
  {
    key: 'magicResist',
    label: fr.run.detailStats.magicResist,
    shortLabel: fr.stats.short.magicResist,
  },
  {
    key: 'attackSpeed',
    label: fr.run.detailStats.attackSpeed,
    shortLabel: fr.stats.short.attackSpeed,
  },
  {
    key: 'moveSpeed',
    label: fr.run.detailStats.moveSpeed,
    shortLabel: fr.stats.short.moveSpeed,
  },
  { key: 'crit', label: fr.run.detailStats.crit, shortLabel: fr.stats.short.crit },
] as const satisfies ReadonlyArray<{
  key: keyof CalculatedStats;
  label: string;
  shortLabel: string;
}>;

function localItemIconUrl(iconUrl: string): string | null {
  return iconUrl.startsWith('/assets/') && !iconUrl.startsWith('//') ? iconUrl : null;
}

function itemFallback(name: string): string {
  const letters = Array.from(name.trim()).filter((letter) => /[\p{L}\p{N}]/u.test(letter));
  return letters.slice(0, 2).join('').toLocaleUpperCase(locale) || fr.run.itemFallback;
}

function formatDetailStat(key: keyof CalculatedStats, value: number): string {
  const formatted = formatStatValue(key, value, locale);
  return key === 'crit' ? `${formatted} %` : formatted;
}

function VisualProgress({
  kind,
  maximum,
  value,
}: {
  kind: 'hp' | 'xp';
  maximum: number;
  value: number;
}) {
  const safeMaximum = Math.max(1, maximum);
  const fillWidth = Math.min(100, Math.max(0, (value / safeMaximum) * 100));

  return (
    <svg
      className={`run-team-stats__progress run-team-stats__progress--${kind}`}
      viewBox="0 0 100 6"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="run-team-stats__progress-track" width="100" height="6" rx="3" />
      <rect className="run-team-stats__progress-value" width={fillWidth} height="6" rx="3" />
    </svg>
  );
}

function EquipmentSlot({ entry, index }: { entry: InventoryEntry | undefined; index: number }) {
  if (!entry) {
    return (
      <li className="run-team-stats__item-slot run-team-stats__item-slot--empty">
        <span aria-hidden="true">+</span>
        <span className="sr-only">{fr.run.emptyItemSlot(index + 1)}</span>
      </li>
    );
  }

  const iconUrl = localItemIconUrl(entry.item.iconUrl);
  const localizedName = itemName(entry.item.id, entry.item.name);
  return (
    <li
      className="run-team-stats__item-slot run-team-stats__item-slot--filled"
      aria-label={fr.run.itemSlot(index + 1, localizedName)}
      title={localizedName}
    >
      <span className="run-team-stats__item-fallback" aria-hidden="true">
        {itemFallback(localizedName)}
      </span>
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          width={48}
          height={48}
          decoding="async"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
    </li>
  );
}

export function RunTeamStatsPanel({ team, inventory }: RunTeamStatsPanelProps) {
  const panelId = useId();
  const [requestedChampionId, setRequestedChampionId] = useState<string | null>(
    () => team[0]?.championId ?? null,
  );
  const authorityEnhancementSnapshot = useRunStore(
    (state) => state.authorityAttempt?.enhancementSnapshot ?? null,
  );
  const authorityMasterySnapshot = useRunStore(
    (state) => state.authorityAttempt?.masterySnapshot ?? null,
  );
  const enhancementStates = useEnhancementStore((state) => state.enhancements);
  const masteryChampions = useMasteryStore((state) => state.champions);

  const sheets = useMemo(() => {
    return team.flatMap<ChampionSheet>((member) => {
      const champion = championDB.getById(member.championId);
      if (!champion) return [];

      const unlockedNodes = authorityEnhancementSnapshot
        ? (authorityEnhancementSnapshot[member.championId] ??
          authorityEnhancementSnapshot[member.championId.toLowerCase()] ??
          {})
        : (enhancementStates[member.championId]?.unlockedNodes ??
          enhancementStates[member.championId.toLowerCase()]?.unlockedNodes ??
          {});
      const enhancementBonuses =
        Object.keys(unlockedNodes).length > 0
          ? enhancementService.calculateStatBonuses(
              enhancementTreeProvider.getTreeForChampion(champion),
              unlockedNodes,
            )
          : undefined;
      const masteryLevel = authorityEnhancementSnapshot
        ? (authorityMasterySnapshot?.[member.championId] ??
          authorityMasterySnapshot?.[member.championId.toLowerCase()] ??
          0)
        : (masteryChampions[member.championId]?.level ??
          masteryChampions[member.championId.toLowerCase()]?.level ??
          0);
      const level = member.level ?? 1;
      const stats = calculateFullStats(
        champion,
        level,
        enhancementBonuses,
        inventory,
        member.championId,
        masteryLevel,
        member.statBoosts,
        member.statMultiplier,
      );
      const currentHp = Math.min(stats.hp, Math.max(0, member.currentHp ?? stats.hp));
      const currentXp = member.currentXp ?? 0;

      return [
        {
          member,
          name: champion.name,
          iconUrl: champion.iconUrl,
          level,
          currentHp,
          stats,
          xpDisplay: formatXpDisplay(level, currentXp),
          xpProgress: getXpProgress(level, currentXp),
          items: inventory
            .filter((entry) => entry.equippedToChampionId === member.championId)
            .slice(0, MAX_ITEMS_PER_CHAMPION),
        },
      ];
    });
  }, [
    authorityEnhancementSnapshot,
    authorityMasterySnapshot,
    enhancementStates,
    inventory,
    masteryChampions,
    team,
  ]);

  const selectedChampionId = sheets.some((sheet) => sheet.member.championId === requestedChampionId)
    ? requestedChampionId
    : (sheets[0]?.member.championId ?? null);
  const selectedSheet = sheets.find((sheet) => sheet.member.championId === selectedChampionId);

  return (
    <section className="run-team-stats run-map-panel" aria-labelledby={`${panelId}-title`}>
      <header className="run-team-stats__header">
        <div>
          <span className="run-team-stats__eyebrow">{fr.run.activeSquad}</span>
          <h2 id={`${panelId}-title`}>{fr.run.team}</h2>
        </div>
        <span className="run-team-stats__count" aria-label={fr.run.championCount(sheets.length)}>
          {sheets.length}/5
        </span>
      </header>

      {sheets.length === 0 ? (
        <p className="run-team-stats__empty">{fr.run.noChampions}</p>
      ) : (
        <>
          <div
            className="run-team-stats__roster"
            role="group"
            aria-label={fr.run.championSelection}
          >
            {sheets.map((sheet) => {
              const isSelected = sheet.member.championId === selectedChampionId;
              const roundedMaxHp = Math.max(1, Math.round(sheet.stats.hp));
              const roundedCurrentHp = Math.min(roundedMaxHp, Math.round(sheet.currentHp));
              const xpText = sheet.level >= 18 ? fr.run.maximumLevel : sheet.xpDisplay;
              return (
                <button
                  key={sheet.member.championId}
                  type="button"
                  className={`run-team-stats__member${isSelected ? ' run-team-stats__member--selected' : ''}`}
                  aria-pressed={isSelected}
                  aria-controls={`${panelId}-details`}
                  aria-label={fr.run.selectChampionSummary(
                    sheet.name,
                    sheet.level,
                    roundedCurrentHp,
                    roundedMaxHp,
                    xpText,
                  )}
                  onClick={() => setRequestedChampionId(sheet.member.championId)}
                >
                  <span className="run-team-stats__portrait" aria-hidden="true">
                    <span className="run-team-stats__portrait-fallback" aria-hidden="true">
                      {sheet.name.slice(0, 2).toLocaleUpperCase(locale)}
                    </span>
                    {sheet.iconUrl ? (
                      <img
                        src={sheet.iconUrl}
                        alt=""
                        width={48}
                        height={48}
                        decoding="async"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    ) : null}
                    <span className="run-team-stats__level">{sheet.level}</span>
                  </span>
                  <span className="run-team-stats__member-copy" aria-hidden="true">
                    <strong>{sheet.name}</strong>
                    <span className="run-team-stats__bar-row">
                      <span>{fr.common.hpShort}</span>
                      <VisualProgress kind="hp" maximum={roundedMaxHp} value={roundedCurrentHp} />
                      <span>
                        {roundedCurrentHp}/{roundedMaxHp}
                      </span>
                    </span>
                    <span className="run-team-stats__bar-row">
                      <span>XP</span>
                      <VisualProgress
                        kind="xp"
                        maximum={100}
                        value={Math.round(sheet.xpProgress)}
                      />
                      <span>{sheet.level >= 18 ? 'MAX' : sheet.xpDisplay}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {selectedSheet ? (
            <section
              id={`${panelId}-details`}
              className="run-team-stats__sheet"
              aria-labelledby={`${panelId}-details-title`}
            >
              <header className="run-team-stats__sheet-header">
                <div>
                  <span className="run-team-stats__eyebrow">{fr.run.selectedSheet}</span>
                  <h3 id={`${panelId}-details-title`}>{selectedSheet.name}</h3>
                </div>
                <span className="run-team-stats__sheet-level">
                  {fr.common.level} {selectedSheet.level}
                </span>
              </header>

              <dl className="run-team-stats__stat-grid">
                <div className="run-team-stats__stat run-team-stats__stat--health" data-stat="hp">
                  <dt>
                    <span aria-hidden="true">{fr.common.hpShort}</span> {fr.run.currentHpMaximum}
                  </dt>
                  <dd>
                    {Math.round(selectedSheet.currentHp)} / {Math.round(selectedSheet.stats.hp)}
                  </dd>
                </div>
                {DETAIL_STATS.map(({ key, label, shortLabel }) => (
                  <div key={key} className="run-team-stats__stat" data-stat={key}>
                    <dt>
                      <span aria-hidden="true">{shortLabel}</span> {label}
                    </dt>
                    <dd>{formatDetailStat(key, selectedSheet.stats[key])}</dd>
                  </div>
                ))}
              </dl>

              <div className="run-team-stats__equipment">
                <div className="run-team-stats__equipment-heading">
                  <h4>{fr.run.equippedItems}</h4>
                  <span>
                    {selectedSheet.items.length}/{MAX_ITEMS_PER_CHAMPION}
                  </span>
                </div>
                <ul className="run-team-stats__item-grid" aria-label={fr.run.itemSlots}>
                  {Array.from({ length: MAX_ITEMS_PER_CHAMPION }, (_, index) => (
                    <EquipmentSlot
                      key={selectedSheet.items[index]?.instanceId ?? `empty-${index}`}
                      entry={selectedSheet.items[index]}
                      index={index}
                    />
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
