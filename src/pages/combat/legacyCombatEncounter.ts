import { championDB } from '@/data';
import { ChampionInstance } from '@/game/ChampionInstance';
import type { CombatEncounter } from '@/game/map/types';

export const LEGACY_ENCOUNTER_ENGINE_VERSIONS = new Set([
  'run-engine-v1',
  'run-engine-v2',
  'run-engine-v3',
  'run-engine-v4',
  'run-engine-v5',
]);

/**
 * Compatibility adapter for an attempt created before encounter ruleset v1.
 * It must remain byte-for-byte equivalent in behavior to those archived
 * authority engines until their attempts have expired.
 */
export function buildLegacyEnemyTeam(
  encounter: CombatEncounter,
  difficultyMultiplier: number,
): ChampionInstance[] {
  const instances: ChampionInstance[] = [];
  for (const enemy of encounter.enemies) {
    const champion = championDB.getById(enemy.championId);
    if (!champion) continue;
    const level = enemy.level ?? 1;
    const multiplier = (enemy.statMultiplier || 1) * difficultyMultiplier;
    if (multiplier === 1) {
      instances.push(new ChampionInstance(champion, level));
      continue;
    }

    const base = champion.stats;
    const scaledChampion = {
      ...champion,
      stats: {
        ...base,
        hp: Math.round(base.hp * multiplier),
        hpPerLevel: Math.round(base.hpPerLevel * multiplier),
        mp: Math.round(base.mp * multiplier),
        mpPerLevel: Math.round(base.mpPerLevel * multiplier),
        armor: Math.round(base.armor * multiplier),
        armorPerLevel: Math.round(base.armorPerLevel * multiplier),
        magicResist: Math.round(base.magicResist * multiplier),
        magicResistPerLevel: Math.round(base.magicResistPerLevel * multiplier),
        attackDamage: Math.round(base.attackDamage * multiplier),
        attackDamagePerLevel: Math.round(base.attackDamagePerLevel * multiplier),
        attackSpeed: Math.round(base.attackSpeed * multiplier * 100) / 100,
        attackSpeedPerLevel: Math.round(base.attackSpeedPerLevel * multiplier * 100) / 100,
        hpRegen: Math.round(base.hpRegen * multiplier * 10) / 10,
        hpRegenPerLevel: Math.round(base.hpRegenPerLevel * multiplier * 10) / 10,
        mpRegen: Math.round(base.mpRegen * multiplier * 10) / 10,
        mpRegenPerLevel: Math.round(base.mpRegenPerLevel * multiplier * 10) / 10,
        crit: Math.round(base.crit * multiplier * 10) / 10,
        critPerLevel: Math.round(base.critPerLevel * multiplier * 10) / 10,
      },
    };
    instances.push(new ChampionInstance(scaledChampion, level));
  }
  return instances;
}
