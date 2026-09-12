import { describe, expect, it } from 'vitest';

import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';
import { legalEn } from '@/i18n/legal.en';
import { legalFr } from '@/i18n/legal.fr';
import { runErrorContent } from '@/i18n/runErrorContent';
import { tutorialContent } from '@/i18n/tutorialContent';

describe('localized catalog number formatting', () => {
  it('formats large gameplay values with each catalog locale', () => {
    expect(fr.run.combatRewardBase(3_600, 1_250)).toBe(
      '+3\u202f600 or, +1\u202f250 XP/champion (KO inclus)',
    );
    expect(en.run.combatRewardBase(3_600, 1_250)).toBe(
      '+3,600 gold, +1,250 XP/champion (including KOs)',
    );

    expect(fr.inventory.saleConfirmed('Épée', 3_600)).toBe(
      'Vente confirmée : Épée, +3\u202f600 or.',
    );
    expect(en.inventory.saleConfirmed('Sword', 3_600)).toBe('Sale confirmed: Sword, +3,600 gold.');
    expect(fr.run.hpValue(1_250, 3_600)).toBe('1\u202f250 sur 3\u202f600 PV');
    expect(en.run.hpValue(1_250, 3_600)).toBe('1,250 of 3,600 HP');
    expect(fr.run.xpProgress(1_250, 3_600)).toBe('1\u202f250/3\u202f600 XP');
    expect(en.run.xpProgress(1_250, 3_600)).toBe('1,250/3,600 XP');
  });

  it('uses natural plurals while formatting counts', () => {
    expect(fr.rules.count(1)).toBe('1 règle affichée');
    expect(fr.rules.count(3_600)).toBe('3\u202f600 règles affichées');
    expect(en.rules.count(1)).toBe('1 rule displayed');
    expect(en.rules.count(3_600)).toBe('3,600 rules displayed');
  });

  it('formats numbers in legal, tutorial, and boundary-error catalogs', () => {
    expect(legalFr.privacy.days(3_600)).toBe('3\u202f600 jours');
    expect(legalEn.privacy.days(3_600)).toBe('3,600 days');
    expect(tutorialContent['fr-FR'].progress(1_250, 3_600)).toBe('Étape 1\u202f250 sur 3\u202f600');
    expect(tutorialContent['en-US'].progress(1_250, 3_600)).toBe('Step 1,250 of 3,600');
    expect(runErrorContent['fr-FR'].verificationInProgress(3_600)).toContain('3\u202f600');
    expect(runErrorContent['en-US'].verificationInProgress(3_600)).toContain('3,600');
  });
});
