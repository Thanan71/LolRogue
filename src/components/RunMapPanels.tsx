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
import {
  hpBarBg,
  hpBarFill,
  inventoryItemStyle,
  panelStyle,
  panelTitle,
  teamMemberStyle,
  tooltipStyle,
} from './runMapStyles';

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
    <div style={panelStyle}>
      <div style={panelTitle}>{fr.run.team}</div>
      {team.length === 0 && (
        <div style={{ color: '#8b949e', fontSize: 12, padding: 8 }}>{fr.run.noChampions}</div>
      )}
      {team.map((m) => {
        const champ = championDB.getById(m.championId);
        const level = m.level ?? 1;
        const currentXp = m.currentXp ?? 0;
        const xpProgress = getXpProgress(level, currentXp);
        const xpDisplay = formatXpDisplay(level, currentXp);
        const maxHp = enhancedHpMap[m.championId] ?? 100;
        const hpPercent = champ
          ? Math.min(100, Math.max(0, ((m.currentHp ?? maxHp) / maxHp) * 100))
          : 100;

        return (
          <div key={m.championId} style={teamMemberStyle}>
            <div style={{ position: 'relative' }}>
              <img
                src={champ?.iconUrl ?? ''}
                alt={champ?.name ?? m.championId}
                style={{ width: 40, height: 40, borderRadius: 4 }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  background: '#1a1a2e',
                  color: '#ffd700',
                  fontSize: 9,
                  fontWeight: 'bold',
                  padding: '1px 3px',
                  borderRadius: 3,
                  border: '1px solid #ffd70044',
                  minWidth: 14,
                  textAlign: 'center',
                }}
              >
                {level}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: '#e6edf3',
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {champ?.name ?? m.championId}
              </div>
              {/* HP Bar */}
              <div
                style={hpBarBg}
                role="progressbar"
                aria-label={`PV de ${champ?.name ?? m.championId}`}
                aria-valuemin={0}
                aria-valuemax={maxHp}
                aria-valuenow={Math.round(m.currentHp ?? maxHp)}
                aria-valuetext={`${Math.round(m.currentHp ?? maxHp)} sur ${maxHp} PV`}
              >
                <div
                  style={{
                    ...hpBarFill,
                    width: `${hpPercent}%`,
                    background: hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#eab308' : '#ef4444',
                  }}
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
                style={{
                  width: '100%',
                  height: 4,
                  background: '#21262d',
                  borderRadius: 2,
                  marginTop: 1,
                  marginBottom: 1,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${xpProgress}%`,
                    height: '100%',
                    background: level >= 18 ? '#9333ea' : '#3b82f6',
                    borderRadius: 1,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ color: '#8b949e', fontSize: 9 }}>
                  {level >= 18 ? 'MAX' : xpDisplay}
                </div>
                <div style={{ color: '#8b949e', fontSize: 9 }}>
                  {Math.round(m.currentHp ?? maxHp)}/{maxHp}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
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
    ap: 'Puissance ability',
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
    abilityHaste: "Hâte d'ability",
    attackRange: "Portée d'attaque",
  };

  const getHoveredEntry = () => {
    if (!hoveredItem) return null;
    return inventory.find((e) => e.instanceId === hoveredItem);
  };

  const hoveredEntry = getHoveredEntry();

  return (
    <div style={{ ...panelStyle, flex: 1, overflow: 'auto', position: 'relative' }}>
      <div style={{ ...panelTitle, display: 'flex', justifyContent: 'space-between' }}>
        <span>Inventaire ({inventory.length}/20)</span>
        <button type="button" onClick={sortInventory} aria-label="Trier l'inventaire">
          Trier
        </button>
      </div>
      {inventory.length === 0 && (
        <div style={{ color: '#8b949e', fontSize: 12, padding: 8 }}>{fr.common.empty}</div>
      )}
      {inventory.map((entry) => (
        <article
          key={entry.instanceId}
          style={{
            ...inventoryItemStyle,
            cursor: 'help',
            border: hoveredItem === entry.instanceId ? '1px solid #c8aa6e' : 'none',
            background: hoveredItem === entry.instanceId ? '#1a2332' : '#0d1117',
          }}
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
            style={{ color: '#e6edf3', fontSize: 11 }}
          >
            {entry.item.name} — détails
          </button>
          <div style={{ color: '#8b949e', fontSize: 10 }}>{entry.item.goldValue}g</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
                    <div key={stat} style={{ fontSize: 9, color: '#9fe3b1' }}>
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
            <div style={{ color: '#22c55e', fontSize: 10 }}>
              Équipé :{' '}
              {championDB.getById(entry.equippedToChampionId)?.name ?? entry.equippedToChampionId}
            </div>
          )}
        </article>
      ))}

      {/* Item Tooltip */}
      {hoveredItem && hoveredEntry && (
        <div id={`item-details-${hoveredEntry.instanceId}`} role="tooltip" style={tooltipStyle}>
          <div style={{ color: '#ffd700', fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>
            {hoveredEntry.item.name}
          </div>
          {hoveredEntry.item.description && (
            <div style={{ color: '#8b949e', fontSize: 10, marginBottom: 6, fontStyle: 'italic' }}>
              {hoveredEntry.item.description}
            </div>
          )}
          {Object.entries(hoveredEntry.item.stats).length > 0 && (
            <div style={{ borderTop: '1px solid #30363d', paddingTop: 4 }}>
              {Object.entries(hoveredEntry.item.stats).map(([key, value]) => {
                if (value === 0) return null;
                const statName = statNames[key] || key;
                const sign = value > 0 ? '+' : '';
                return (
                  <div key={key} style={{ color: '#22c55e', fontSize: 10, lineHeight: 1.4 }}>
                    {sign}
                    {value} {statName}
                  </div>
                );
              })}
            </div>
          )}
          <div
            style={{
              color: '#8b949e',
              fontSize: 9,
              marginTop: 4,
              borderTop: '1px solid #30363d',
              paddingTop: 4,
            }}
          >
            Valeur: {hoveredEntry.item.goldValue}g
          </div>
        </div>
      )}
    </div>
  );
}
