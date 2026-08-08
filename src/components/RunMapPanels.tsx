import { useMemo, useState } from 'react';
import { championDB } from '@/data/championDatabase';
import {
  type CanonicalStatKey,
  formatStatValue,
  normalizeStatKey,
  STAT_LABELS,
} from '@/game/stats/statContract';
import { fr } from '@/i18n/fr';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import type { InventoryEntry, TeamMember } from '@/types/run';
import { calculateFullStats, calculateMaxHP } from '@/utils/statCalculator';
import { formatXpDisplay, getXpProgress } from '@/utils/xpSystem';

export function TeamPanel({
  team,
  inventory,
}: {
  team: TeamMember[];
  inventory: InventoryEntry[];
}) {
  const authorityAttempt = useRunStore((state) => state.authorityAttempt);
  // Calculate enhanced max HP for each team member (with level, enhancements, items, and event stat boosts)
  const enhancedHpMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const member of team) {
      const champ = championDB.getById(member.championId);
      if (!champ) continue;

      const level = member.level ?? 1;

      // Get enhancement bonuses
      const unlockedNodes = authorityAttempt
        ? (authorityAttempt.enhancementSnapshot[member.championId] ??
          authorityAttempt.enhancementSnapshot[member.championId.toLowerCase()] ??
          {})
        : useEnhancementStore.getState().getEnhancementState(member.championId).unlockedNodes;

      let enhancementBonuses = undefined;
      if (Object.keys(unlockedNodes).length > 0) {
        const tree = enhancementTreeProvider.getTreeForChampion(champ);
        enhancementBonuses = enhancementService.calculateStatBonuses(tree, unlockedNodes);
      }

      // Use calculateMaxHP which handles level, enhancements, items, and event stat boosts
      map[member.championId] = calculateMaxHP(
        champ,
        level,
        enhancementBonuses,
        inventory,
        member.championId,
        member.statBoosts,
        member.statMultiplier,
        authorityAttempt
          ? (authorityAttempt.masterySnapshot?.[member.championId] ?? 0)
          : useMasteryStore.getState().getChampionMastery(member.championId).level,
      );
    }
    return map;
  }, [authorityAttempt, team, inventory]);

  return (
    <section className="run-map-panel" aria-labelledby="run-map-team-title">
      <h2 className="run-map-panel__title" id="run-map-team-title">
        {fr.run.team}
      </h2>
      {team.length === 0 && <p className="run-map-panel__empty">{fr.run.noChampions}</p>}
      {team.map((m) => {
        const champ = championDB.getById(m.championId);
        const level = m.level ?? 1;
        const currentXp = m.currentXp ?? 0;
        const xpProgress = getXpProgress(level, currentXp);
        const xpDisplay = formatXpDisplay(level, currentXp);
        const maxHp = enhancedHpMap[m.championId] ?? 100;
        const currentHp = Math.min(maxHp, Math.max(0, m.currentHp ?? maxHp));
        const hpPercent = champ ? Math.min(100, Math.max(0, (currentHp / maxHp) * 100)) : 100;
        const healthClass =
          hpPercent > 50
            ? 'run-map-progress__fill--healthy'
            : hpPercent > 25
              ? 'run-map-progress__fill--warning'
              : 'run-map-progress__fill--danger';

        return (
          <article key={m.championId} className="run-map-team-member">
            <div className="run-map-team-member__portrait">
              <img
                src={champ?.iconUrl ?? ''}
                alt=""
                width={40}
                height={40}
                decoding="async"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <span className="run-map-team-member__level" aria-label={`Niveau ${level}`}>
                {level}
              </span>
            </div>
            <div className="run-map-team-member__copy">
              <div className="run-map-team-member__name">{champ?.name ?? m.championId}</div>
              {/* HP Bar */}
              <div
                className="run-map-progress run-map-progress--hp"
                role="progressbar"
                aria-label={`PV de ${champ?.name ?? m.championId}`}
                aria-valuemin={0}
                aria-valuemax={Math.round(maxHp)}
                aria-valuenow={Math.round(currentHp)}
                aria-valuetext={`${Math.round(currentHp)} sur ${Math.round(maxHp)} PV`}
              >
                <div
                  className={`run-map-progress__fill ${healthClass}`}
                  style={{ width: `${hpPercent}%` }}
                />
              </div>
              {/* XP Bar */}
              <div
                role="progressbar"
                aria-label={`Expérience de ${champ?.name ?? m.championId}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(xpProgress)}
                aria-valuetext={level >= 18 ? 'Niveau maximum' : xpDisplay}
                className="run-map-progress run-map-progress--xp"
              >
                <div
                  className={`run-map-progress__fill ${
                    level >= 18 ? 'run-map-progress__fill--max' : 'run-map-progress__fill--xp'
                  }`}
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
              <div className="run-map-team-member__meta">
                <span>{level >= 18 ? 'MAX' : xpDisplay}</span>
                <span>
                  {Math.round(currentHp)}/{Math.round(maxHp)} PV
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export function InventoryPanel({
  inventory,
  team,
}: {
  inventory: InventoryEntry[];
  team: TeamMember[];
}) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const equipItem = useRunStore((state) => state.equipItem);
  const unequipItem = useRunStore((state) => state.unequipItem);
  const sellItem = useRunStore((state) => state.sellItem);
  const sortInventory = useRunStore((state) => state.sortInventory);
  const authorityAttempt = useRunStore((state) => state.authorityAttempt);

  const getEquipPreview = (entry: InventoryEntry, member: TeamMember) => {
    const champion = championDB.getById(member.championId);
    if (!champion) return [];
    const unlockedNodes = authorityAttempt
      ? (authorityAttempt.enhancementSnapshot[member.championId] ?? {})
      : useEnhancementStore.getState().getEnhancementState(member.championId).unlockedNodes;
    const bonuses = enhancementService.calculateStatBonuses(
      enhancementTreeProvider.getTreeForChampion(champion),
      unlockedNodes,
    );
    const masteryLevel = authorityAttempt
      ? (authorityAttempt.masterySnapshot?.[member.championId] ?? 0)
      : useMasteryStore.getState().getChampionMastery(member.championId).level;
    const before = calculateFullStats(
      champion,
      member.level,
      bonuses,
      inventory,
      member.championId,
      masteryLevel,
      member.statBoosts,
      member.statMultiplier,
    );
    const previewInventory = inventory.map((candidate) =>
      candidate.instanceId === entry.instanceId
        ? { ...candidate, equippedToChampionId: member.championId }
        : candidate,
    );
    const after = calculateFullStats(
      champion,
      member.level,
      bonuses,
      previewInventory,
      member.championId,
      masteryLevel,
      member.statBoosts,
      member.statMultiplier,
    );
    const affected = new Set(
      Object.keys(entry.item.stats)
        .map(normalizeStatKey)
        .filter((key): key is CanonicalStatKey => key !== null),
    );
    return [...affected].map((stat) => ({ stat, before: before[stat], after: after[stat] }));
  };

  // Stat name translations
  const statNames: Record<string, string> = {
    hp: 'Points de vie',
    mp: 'Points de mana',
    atk: "Dégâts d'attaque",
    ap: 'Puissance magique',
    def: 'Armure',
    mr: 'Résistance magique',
    spd: 'Vitesse de déplacement',
    crit: 'Chance de critique',
    attackSpeed: "Vitesse d'attaque",
    hpRegen: 'Régénération PV',
    mpRegen: 'Régénération PM',
    armorPen: "Pénétration d'armure",
    magicPen: 'Pénétration magique',
    lifesteal: 'Vol de vie',
    omnivamp: 'Omnivamp',
    tenacity: 'Ténacité',
    abilityHaste: 'Hâte de compétence',
    attackRange: "Portée d'attaque",
  };

  const getHoveredEntry = () => {
    if (!hoveredItem) return null;
    return inventory.find((e) => e.instanceId === hoveredItem);
  };

  const hoveredEntry = getHoveredEntry();

  return (
    <section
      className="run-map-panel run-map-panel--inventory"
      aria-labelledby="run-map-inventory-title"
    >
      <div className="run-map-panel__title run-map-panel__title--actions">
        <span>Inventaire ({inventory.length}/20)</span>
        <button type="button" onClick={sortInventory} aria-label="Trier l'inventaire">
          Trier
        </button>
      </div>
      <span className="sr-only" id="run-map-inventory-title">
        Inventaire
      </span>
      {inventory.length === 0 && <p className="run-map-panel__empty">{fr.common.empty}</p>}
      {inventory.map((entry) => (
        <article
          key={entry.instanceId}
          className={`run-map-inventory-item${
            hoveredItem === entry.instanceId ? ' run-map-inventory-item--active' : ''
          }`}
          onMouseEnter={() => setHoveredItem(entry.instanceId)}
          onMouseLeave={() => setHoveredItem(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setHoveredItem(null);
          }}
        >
          <button
            type="button"
            aria-expanded={hoveredItem === entry.instanceId}
            aria-controls={`item-details-${entry.instanceId}`}
            onFocus={() => setHoveredItem(entry.instanceId)}
            onClick={() =>
              setHoveredItem((current) => (current === entry.instanceId ? null : entry.instanceId))
            }
            className="run-map-inventory-item__summary"
          >
            {entry.item.name} — détails
          </button>
          <div className="run-map-inventory-item__value">{entry.item.goldValue} or</div>
          <div className="run-map-inventory-actions">
            {entry.equippedToChampionId ? (
              <button type="button" onClick={() => unequipItem(entry.instanceId)}>
                Déséquiper
              </button>
            ) : (
              team.map((member) => (
                <div key={member.championId}>
                  <button
                    type="button"
                    onClick={() => equipItem(entry.instanceId, member.championId)}
                  >
                    Équiper {championDB.getById(member.championId)?.name ?? member.championId}
                  </button>
                  {getEquipPreview(entry, member).map(({ stat, before, after }) => (
                    <div key={stat} className="run-map-inventory-preview">
                      {STAT_LABELS[stat]} : {formatStatValue(stat, before)} →{' '}
                      {formatStatValue(stat, after)}
                    </div>
                  ))}
                </div>
              ))
            )}
            <button type="button" onClick={() => sellItem(entry.instanceId)}>
              Vendre {Math.max(1, Math.floor(entry.item.goldValue / 2))}g
            </button>
          </div>
          {entry.equippedToChampionId && (
            <div className="run-map-inventory-item__equipped">
              Équipé :{' '}
              {championDB.getById(entry.equippedToChampionId)?.name ?? entry.equippedToChampionId}
            </div>
          )}
        </article>
      ))}

      {/* Item Tooltip */}
      {hoveredItem && hoveredEntry && (
        <div
          id={`item-details-${hoveredEntry.instanceId}`}
          role="tooltip"
          className="run-map-item-tooltip"
        >
          <div className="run-map-item-tooltip__title">{hoveredEntry.item.name}</div>
          {hoveredEntry.item.description && (
            <div className="run-map-item-tooltip__description">{hoveredEntry.item.description}</div>
          )}
          {Object.entries(hoveredEntry.item.stats).length > 0 && (
            <div className="run-map-item-tooltip__stats">
              {Object.entries(hoveredEntry.item.stats).map(([key, value]) => {
                if (value === 0) return null;
                const statName = statNames[key] || key;
                const sign = value > 0 ? '+' : '';
                return (
                  <div key={key} className="run-map-item-tooltip__stat">
                    {sign}
                    {value} {statName}
                  </div>
                );
              })}
            </div>
          )}
          <div className="run-map-item-tooltip__value">
            Valeur : {hoveredEntry.item.goldValue} or
          </div>
        </div>
      )}
    </section>
  );
}
