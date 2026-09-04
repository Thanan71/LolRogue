import { describe, expect, it } from 'vitest';
import { implementedChampions } from '@/data/champion';
import { isSpellCombatReady } from '@/game/battle/combatContentSupport';
import { canUpgradeSpell } from '@/game/run/spellUpgradeRules';
import type { SpellEffect } from '@/types/champion';

const PRIMARY_VALUE_FIELDS = ['baseDamage', 'baseValue', 'values'] as const;

function primaryValueImproves(
  effects: readonly SpellEffect[],
  previousRankIndex: number,
  rankIndex: number,
  maxRank: number,
): boolean {
  return effects.some((effect) =>
    PRIMARY_VALUE_FIELDS.some((field) => {
      const values = effect[field];
      if (!values || values.length !== maxRank) return false;
      const previous = values[previousRankIndex];
      const current = values[rankIndex];
      if (previous === undefined || current === undefined || current <= previous) return false;
      return previous === 0 || (current - previous) / Math.abs(previous) >= 0.1;
    }),
  );
}

describe('maintained spell rank progression', () => {
  it('keeps every published rank array aligned with the spell maximum', () => {
    for (const champion of implementedChampions) {
      for (const spell of champion.spells) {
        const label = `${champion.id} ${spell.id}`;
        expect(spell.cooldownTurns, `${label} cooldown ranks`).toHaveLength(spell.maxRank);
        expect(spell.cost, `${label} cost ranks`).toHaveLength(spell.maxRank);
        expect(spell.range, `${label} range ranks`).toHaveLength(spell.maxRank);
        for (const effect of spell.effects) {
          for (const field of PRIMARY_VALUE_FIELDS) {
            const values = effect[field];
            if (values)
              expect(values, `${label} ${effect.type}.${field}`).toHaveLength(spell.maxRank);
          }
        }
      }
    }
  });

  it('requires each extra rank to improve effect, cooldown or cost by a useful amount', () => {
    let transitions = 0;
    for (const champion of implementedChampions) {
      for (const spell of champion.spells) {
        for (let rankIndex = 1; rankIndex < spell.maxRank; rankIndex++) {
          transitions++;
          const cooldownImproves =
            spell.cooldownTurns[rankIndex]! < spell.cooldownTurns[rankIndex - 1]!;
          const costImproves = spell.cost[rankIndex]! < spell.cost[rankIndex - 1]!;
          const effectImproves = primaryValueImproves(
            spell.effects,
            rankIndex - 1,
            rankIndex,
            spell.maxRank,
          );
          expect(
            cooldownImproves || costImproves || effectImproves,
            `${champion.id} ${spell.id} rank ${rankIndex + 1} has no useful marginal value`,
          ).toBe(true);
        }
      }
    }
    expect(transitions).toBe(136);
  });

  it('keeps non-combat vision at one rank and out of upgrade choices', () => {
    const hawkshot = implementedChampions
      .find((champion) => champion.id === 'Ashe')
      ?.spells.find((spell) => spell.id === 'AsheSpiritOfTheHawk');
    if (!hawkshot) throw new Error('Missing Ashe Hawkshot.');

    expect(hawkshot).toMatchObject({ maxRank: 1, cooldownTurns: [2], cost: [0] });
    expect(isSpellCombatReady(hawkshot)).toBe(false);
    expect(
      canUpgradeSpell(
        { championId: 'Ashe', level: 18, spellRanks: { Q: 1, W: 1, E: 1, R: 1 } },
        'E',
      ),
    ).toBe(false);
  });
});
