import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { buildSpellImpactPreview, formatSpellImpactAmount } from '@/game/presentation/spellPreview';

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
        expect.objectContaining({ label: 'Dégâts physiques', tone: 'physical', amount: 95 }),
        expect.objectContaining({ label: 'Silence', tone: 'control', suffix: '1,5 s' }),
      ]),
    );
    expect(buildSpellImpactPreview(garen.spells[1], 1, combatStats)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Bouclier', tone: 'shield', amount: 90 }),
      ]),
    );
    expect(buildSpellImpactPreview(garen.spells[3], 1, combatStats)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Dégâts bruts', tone: 'true', amount: 150 }),
        expect.objectContaining({ label: "Seuil d'exécution", amount: 30, amountStyle: 'percent' }),
      ]),
    );
  });

  it('localizes decimal durations, percentages and effect stat labels', () => {
    const garen = championDB.getById('Garen');
    const warwick = championDB.getById('Warwick');
    if (!garen || !warwick) throw new Error('Garen or Warwick is missing.');

    expect(buildSpellImpactPreview(garen.spells[1], 1, combatStats)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 30,
          amountStyle: 'percent',
          suffix: 'Armure',
        }),
      ]),
    );
    expect(buildSpellImpactPreview(warwick.spells[2], 1, combatStats)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 35,
          amountStyle: 'percent',
          suffix: 'Réduction des dégâts',
        }),
      ]),
    );

    const percentage = buildSpellImpactPreview(garen.spells[1], 1, combatStats).find(
      ({ amountStyle }) => amountStyle === 'percent',
    );
    expect(percentage && formatSpellImpactAmount(percentage)).toBe('30 %');
    expect(
      formatSpellImpactAmount({ id: 'decimal', label: 'Test', tone: 'control', amount: 2.5 }),
    ).toBe('2,5');
  });
});
