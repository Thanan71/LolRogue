import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { buildSpellImpactPreview } from '@/game/presentation/spellPreview';

const combatStats = { attackDamage: 100, abilityPower: 80 };

describe('spell impact preview', () => {
  it('shows the same target-independent magical damage formula as the battle engine', () => {
    const luxQ = championDB.getById('Lux')?.spells[0];
    if (!luxQ) throw new Error('Lux Q is missing.');

    expect(buildSpellImpactPreview(luxQ, 1, combatStats)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Dégâts magiques',
          tone: 'magical',
          amount: 128,
          suffix: 'avant défenses',
        }),
        expect.objectContaining({ label: 'Immobilisation', tone: 'control', suffix: '2 s' }),
      ]),
    );
  });

  it('distinguishes physical, true and non-damage impacts', () => {
    const garen = championDB.getById('Garen');
    if (!garen) throw new Error('Garen is missing.');

    expect(buildSpellImpactPreview(garen.spells[0], 1, combatStats)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Dégâts physiques', tone: 'physical', amount: 80 }),
      ]),
    );
    expect(buildSpellImpactPreview(garen.spells[1], 1, combatStats)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Bouclier', tone: 'shield', amount: 70 }),
      ]),
    );
    expect(buildSpellImpactPreview(garen.spells[3], 1, combatStats)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Dégâts bruts', tone: 'true', amount: 150 }),
        expect.objectContaining({ label: "Seuil d'exécution", amount: 30 }),
      ]),
    );
  });
});
