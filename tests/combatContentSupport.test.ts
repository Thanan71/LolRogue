import { describe, expect, it } from 'vitest';
import { championDB } from '../src/data/championDatabase';
import {
  IMPLEMENTED_PASSIVE_CHAMPIONS,
  isPassiveCombatReady,
  isSpellCombatReady,
  isSpellEffectConfigured,
  UNAVAILABLE_COMBAT_DESCRIPTION,
} from '../src/game/battle/combatContentSupport';

describe('published combat content support', () => {
  it('keeps every maintained passive executable and hides generated incomplete passives', () => {
    for (const champion of championDB.getAll()) {
      const ready = isPassiveCombatReady(champion.id, champion.passive);
      expect(ready).toBe(IMPLEMENTED_PASSIVE_CHAMPIONS.has(champion.id));
      if (!ready) expect(UNAVAILABLE_COMBAT_DESCRIPTION.length).toBeGreaterThan(0);
    }
  });

  it('requires every spell effect to have both a handler and usable rank data', () => {
    const darius = championDB.getById('Darius')!;
    expect(darius.spells.every((spell) => isSpellCombatReady(spell))).toBe(true);

    const generatedIncomplete = championDB
      .getAll()
      .flatMap((champion) => champion.spells)
      .find((spell) => !isSpellCombatReady(spell));
    expect(generatedIncomplete).toBeDefined();
  });

  it('rejects unknown effect families and empty numeric payloads', () => {
    expect(isSpellEffectConfigured({ type: 'teleport' }, 0)).toBe(false);
    expect(
      isSpellEffectConfigured({ type: 'damage', damageType: 'physical', baseDamage: [] }, 0),
    ).toBe(false);
  });
});
