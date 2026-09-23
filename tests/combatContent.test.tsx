// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { implementedChampions } from '@/data/champion';
import { ENHANCEMENT_TREES_BY_ROLE } from '@/data/enhancementTrees';
import { ActionType } from '@/game/battle/types';
import { getCombatVisualProfile } from '@/game/presentation/combatVisuals';
import {
  COMBAT_ENHANCEMENT_EFFECT_IDS,
  COMBAT_PHASE_IDS,
  COMBAT_VISUAL_TITLE_IDS,
  type CombatContentLocale,
  type CombatEnhancementEffectId,
  type CombatVisualTitleId,
  combatContent,
} from '@/i18n/combatContent';
import type { CombatantInfo } from '@/stores/battleStore';
import { scanUserCopyFile } from './helpers/userCopyScanner';

const SPELL_ACTIONS = [
  ActionType.SpellQ,
  ActionType.SpellW,
  ActionType.SpellE,
  ActionType.SpellR,
] as const;

const EXPECTED_VISUAL_PARAMETERS: Readonly<
  Record<CombatVisualTitleId, readonly [shape: string, tone: string, glyph: string]>
> = {
  basic_attack: ['slash', 'steel', '✦'],
  'fallback:spell_q': ['projectile', 'arcane', 'Q'],
  'fallback:spell_w': ['wave', 'arcane', 'W'],
  'fallback:spell_e': ['burst', 'arcane', 'E'],
  'fallback:spell_r': ['beam', 'solar', 'R'],
  'Annie:spell_q': ['projectile', 'fire', '●'],
  'Annie:spell_w': ['wave', 'fire', '≋'],
  'Annie:spell_e': ['aura', 'fire', '◇'],
  'Annie:spell_r': ['meteor', 'fire', '✹'],
  'Ashe:spell_q': ['projectile', 'frost', '❯'],
  'Ashe:spell_w': ['wave', 'frost', '❄'],
  'Ashe:spell_e': ['aura', 'frost', '◉'],
  'Ashe:spell_r': ['projectile', 'frost', '➶'],
  'Darius:spell_q': ['vortex', 'blood', '◒'],
  'Darius:spell_w': ['slash', 'steel', '╱'],
  'Darius:spell_e': ['projectile', 'blood', '⌁'],
  'Darius:spell_r': ['meteor', 'blood', '▼'],
  'Garen:spell_q': ['slash', 'solar', '✦'],
  'Garen:spell_w': ['aura', 'steel', '⬡'],
  'Garen:spell_e': ['vortex', 'steel', '◎'],
  'Garen:spell_r': ['beam', 'solar', '†'],
  'Jinx:spell_q': ['projectile', 'electric', '✣'],
  'Jinx:spell_w': ['beam', 'electric', 'ϟ'],
  'Jinx:spell_e': ['burst', 'electric', '⌖'],
  'Jinx:spell_r': ['projectile', 'fire', '➤'],
  'Leona:spell_q': ['slash', 'solar', '✷'],
  'Leona:spell_w': ['aura', 'solar', '☼'],
  'Leona:spell_e': ['beam', 'solar', '↝'],
  'Leona:spell_r': ['meteor', 'solar', '✺'],
  'Lux:spell_q': ['projectile', 'arcane', '◈'],
  'Lux:spell_w': ['aura', 'arcane', '◇'],
  'Lux:spell_e': ['burst', 'arcane', '◉'],
  'Lux:spell_r': ['beam', 'arcane', '━'],
  'Malphite:spell_q': ['projectile', 'earth', '◆'],
  'Malphite:spell_w': ['wave', 'earth', '≋'],
  'Malphite:spell_e': ['burst', 'earth', '✹'],
  'Malphite:spell_r': ['meteor', 'earth', '⬢'],
  'Soraka:spell_q': ['meteor', 'nature', '✧'],
  'Soraka:spell_w': ['aura', 'nature', '✚'],
  'Soraka:spell_e': ['vortex', 'shadow', '◌'],
  'Soraka:spell_r': ['wave', 'nature', '✦'],
  'Warwick:spell_q': ['slash', 'blood', '◢'],
  'Warwick:spell_w': ['wave', 'blood', '⌁'],
  'Warwick:spell_e': ['burst', 'shadow', '◖'],
  'Warwick:spell_r': ['projectile', 'blood', '➤'],
};

const COMBAT_SOURCE_FILES = [
  'src/pages/CombatPage.tsx',
  'src/pages/combat/combatPresenter.ts',
  'src/components/CombatUI/AbilityBar.tsx',
  'src/components/CombatUI/BattleSpeedControl.tsx',
  'src/components/CombatUI/CombatLog.tsx',
  'src/components/CombatUI/CombatStage.tsx',
  'src/components/CombatUI/CombatUI.tsx',
  'src/components/CombatUI/CombatantPortrait.tsx',
  'src/components/CombatUI/SpellTooltip.tsx',
  'src/components/CombatUI/TurnIndicator.tsx',
  'src/components/CombatUI/index.ts',
  'src/game/presentation/combatVisuals.ts',
  'src/game/presentation/spellPreview.ts',
  'src/hooks/useBattleManager.ts',
] as const;

const portrait: CombatantInfo = {
  targetId: 'player-Lux',
  id: 'Lux',
  name: 'Lux',
  level: 3,
  currentHp: 420,
  maxHp: 600,
  currentMp: 80,
  maxMp: 100,
  iconUrl: '',
  isDefeated: false,
  side: 'player',
  spells: [],
};

function catalogShape(value: unknown): unknown {
  if (typeof value === 'function') return 'function';
  if (Array.isArray(value)) return value.map(catalogShape);
  if (!value || typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, child]) => [key, catalogShape(child)]),
  );
}

function setStoredLocale(contentLocale: CombatContentLocale): void {
  window.localStorage.setItem(
    'lolrogue-settings',
    JSON.stringify({ state: { language: contentLocale } }),
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.resetModules();
});

describe('combat content catalog', () => {
  it('localizes every combat UI phase and its round number without exposing internal IDs', () => {
    const french = combatContent['fr-FR'].ui;
    const english = combatContent['en-US'].ui;

    expect(french.round(1280)).toBe('Tour 1 280');
    expect(english.round(1280)).toBe('Round 1,280');
    expect(COMBAT_PHASE_IDS.map((phase) => french.phase(phase))).toEqual([
      'Phase : En attente',
      'Phase : Démarrage',
      'Phase : Tour en cours',
      'Phase : Transition entre les tours',
      'Phase : Terminé',
    ]);
    expect(COMBAT_PHASE_IDS.map((phase) => english.phase(phase))).toEqual([
      'Phase: Waiting',
      'Phase: Starting',
      'Phase: Turn in progress',
      'Phase: Between turns',
      'Phase: Finished',
    ]);
  });

  it('keeps strict structural parity and complete stable visual IDs in both locales', () => {
    expect(catalogShape(combatContent['en-US'])).toEqual(catalogShape(combatContent['fr-FR']));

    const championVisualIds = implementedChampions.flatMap((champion) =>
      SPELL_ACTIONS.map((action) => `${champion.id}:${action}`),
    );
    const expectedIds = [
      'basic_attack',
      'fallback:spell_q',
      'fallback:spell_w',
      'fallback:spell_e',
      'fallback:spell_r',
      ...championVisualIds,
    ].sort();

    expect([...COMBAT_VISUAL_TITLE_IDS].sort()).toEqual(expectedIds);
    for (const contentLocale of ['fr-FR', 'en-US'] as const) {
      const titles = combatContent[contentLocale].visuals;
      expect(Object.keys(titles).sort()).toEqual(expectedIds);
      expect(Object.values(titles).every((title) => title.trim().length > 0)).toBe(true);
    }
  });

  it('preserves every visual shape, tone, and glyph while sourcing titles from stable IDs', () => {
    const basic = getCombatVisualProfile(undefined, ActionType.BasicAttack);
    expect([basic.shape, basic.tone, basic.glyph]).toEqual(EXPECTED_VISUAL_PARAMETERS.basic_attack);
    expect(basic.title).toBe(combatContent['fr-FR'].visuals.basic_attack);

    for (const champion of implementedChampions) {
      SPELL_ACTIONS.forEach((action) => {
        const id = `${champion.id}:${action}` as CombatVisualTitleId;
        const profile = getCombatVisualProfile(champion.id, action);
        expect([profile.shape, profile.tone, profile.glyph], id).toEqual(
          EXPECTED_VISUAL_PARAMETERS[id],
        );
        expect(profile.title, id).toBe(combatContent['fr-FR'].visuals[id]);
      });
    }

    SPELL_ACTIONS.forEach((action) => {
      const id = `fallback:${action}` as CombatVisualTitleId;
      const profile = getCombatVisualProfile('UnknownChampion', action);
      expect([profile.shape, profile.tone, profile.glyph], id).toEqual(
        EXPECTED_VISUAL_PARAMETERS[id],
      );
      expect(profile.title, id).toBe(combatContent['fr-FR'].visuals[id]);
    });
  });

  it('covers every enhancement effect by stable IDs with explicit localized presentation', () => {
    const sourceEffects = Object.values(ENHANCEMENT_TREES_BY_ROLE).flatMap((tree) =>
      [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)].flatMap((node) =>
        (node.effects ?? []).map((effect) => `${node.id}:${effect.type}`),
      ),
    );

    expect(sourceEffects.sort()).toEqual([...COMBAT_ENHANCEMENT_EFFECT_IDS].sort());
    for (const id of sourceEffects) {
      const french = combatContent['fr-FR'].presenter.effects[id as CombatEnhancementEffectId];
      const english = combatContent['en-US'].presenter.effects[id as CombatEnhancementEffectId];
      expect(french.trim()).not.toBe('');
      expect(english.trim()).not.toBe('');
      expect(english).not.toBe(french);
    }
  });

  it('formats gameplay-specific logs naturally and keeps their mechanics in both locales', () => {
    const french = combatContent['fr-FR'].logs;
    const english = combatContent['en-US'].logs;

    expect(french.roundStart(1280)).toBe('=== Tour 1 280 ===');
    expect(english.roundStart(1280)).toBe('=== Round 1,280 ===');
    expect(french.crowdControlApplied('Annie', 'Lux', french.crowdControl.stun, 1.5)).toBe(
      'Annie → Lux: étourdissement (1,5 tours)',
    );
    expect(english.crowdControlApplied('Annie', 'Lux', english.crowdControl.stun, 1.5)).toBe(
      'Annie → Lux: stun (1.5 turns)',
    );
    expect(french.damage('Lux', 'Garen', 1280, true)).toBe('Lux → Garen: 1 280 dégâts CRITIQUE !');
    expect(english.damage('Lux', 'Garen', 1280, true)).toBe('Lux → Garen: 1,280 damage CRITICAL!');
    expect(french.heal('Soraka', 'Lux', 1280)).toBe('Soraka → Lux: +1 280 PV');
    expect(english.heal('Soraka', 'Lux', 1280)).toBe('Soraka → Lux: +1,280 HP');
    expect(french.shield('Soraka', 'Lux', 1280)).toBe('Soraka → Lux: +1 280 bouclier');
    expect(english.shield('Soraka', 'Lux', 1280)).toBe('Soraka → Lux: +1,280 shield');
    expect(french.revive('Soraka', 'Lux', 1280)).toBe('Soraka ranime Lux avec 1 280 PV');
    expect(english.revive('Soraka', 'Lux', 1280)).toBe('Soraka revives Lux with 1,280 HP');

    expect(combatContent['fr-FR'].stage.shield(1280)).toBe('+1 280 bouclier');
    expect(combatContent['en-US'].stage.shield(1280)).toBe('+1,280 shield');
    expect(combatContent['fr-FR'].stage.revived(1280)).toBe('Ranimé · 1 280 PV');
    expect(combatContent['en-US'].stage.revived(1280)).toBe('Revived · 1,280 HP');
    expect(combatContent['fr-FR'].stage.targets(1280)).toBe('1 280 cibles');
    expect(combatContent['en-US'].stage.targets(1280)).toBe('1,280 targets');
    expect(combatContent['fr-FR'].tooltip.cooldownStatus(1280)).toBe(
      '⏳ Recharge : 1 280 tours restants',
    );
    expect(combatContent['fr-FR'].tooltip.cooldownStatus(1)).toBe('⏳ Recharge : 1 tour restant');
    expect(combatContent['en-US'].tooltip.cooldownStatus(1280)).toBe(
      '⏳ Cooldown: 1,280 turns remaining',
    );
    expect(combatContent['en-US'].tooltip.cooldownStatus(1)).toBe('⏳ Cooldown: 1 turn remaining');
    expect(combatContent['fr-FR'].presenter.ranked('Bonus', 1280, 2400)).toBe(
      'Bonus (Rang 1 280/2 400)',
    );
    expect(combatContent['en-US'].presenter.ranked('Bonus', 1280, 2400)).toBe(
      'Bonus (Rank 1,280/2,400)',
    );
    expect(combatContent['fr-FR'].presenter.stats.atk).toBe('ATQ');
    expect(combatContent['fr-FR'].presenter.stats.ap).toBe('PUI');
    expect(combatContent['en-US'].presenter.stats.atk).toBe('AD');
    expect(combatContent['en-US'].presenter.stats.ap).toBe('AP');
  });

  it('projects spell impact labels in French and English without changing numerical estimates', async () => {
    const luxQ = implementedChampions.find(({ id }) => id === 'Lux')?.spells[0];
    if (!luxQ) throw new Error('Lux Q is missing.');

    setStoredLocale('fr-FR');
    vi.resetModules();
    const frenchPreview = await import('@/game/presentation/spellPreview');
    expect(
      frenchPreview.buildSpellImpactPreview(luxQ, 1, { attackDamage: 100, abilityPower: 80 }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Dégâts magiques',
          amount: 128,
          suffix: 'avant défenses',
        }),
        expect.objectContaining({ label: 'Immobilisation', suffix: '2 s' }),
      ]),
    );

    setStoredLocale('en-US');
    vi.resetModules();
    const englishPreview = await import('@/game/presentation/spellPreview');
    expect(
      englishPreview.buildSpellImpactPreview(luxQ, 1, { attackDamage: 100, abilityPower: 80 }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Magic damage',
          amount: 128,
          suffix: 'before defenses',
        }),
        expect.objectContaining({ label: 'Root', suffix: '2 s' }),
      ]),
    );
  });

  it('renders localized combat ARIA labels in both locales', async () => {
    const largePortrait = {
      ...portrait,
      level: 1280,
      currentHp: 1280,
      maxHp: 2400,
      currentMp: 1300,
      maxMp: 2500,
    };

    setStoredLocale('fr-FR');
    vi.resetModules();
    const [frenchModule, frenchPresenter] = await Promise.all([
      import('@/components/CombatUI/CombatantPortrait'),
      import('@/pages/combat/combatPresenter'),
    ]);
    const frenchBonuses = [
      frenchPresenter.formatCombatFlatBonus(1280, 'PV'),
      frenchPresenter.formatCombatPercentageBonus(0.15, 'Critique'),
      'Bonus',
      ...Array.from({ length: 1280 }, () => 'Bonus masqué'),
    ];
    const { container: frenchContainer } = render(
      <frenchModule.CombatantPortrait
        combatant={largePortrait}
        isActive={false}
        enhancementBonuses={frenchBonuses}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cibler Lux' })).toBeInTheDocument();
    const frenchHealth = screen.getByRole('progressbar', { name: 'PV de Lux' });
    const frenchMana = screen.getByRole('progressbar', { name: 'PM de Lux' });
    expect(frenchHealth).toHaveAttribute('aria-valuenow', '1280');
    expect(frenchHealth).toHaveAttribute('aria-valuemax', '2400');
    expect(frenchMana).toHaveAttribute('aria-valuenow', '1300');
    expect(frenchMana).toHaveAttribute('aria-valuemax', '2500');
    expect(
      frenchContainer.querySelector('.combatant-portrait__meter-label--health')?.textContent,
    ).toBe('1 280 / 2 400');
    expect(
      frenchContainer.querySelector('.combatant-portrait__meter-label--mana')?.textContent,
    ).toBe('1 300 / 2 500');
    const frenchBonusElements = frenchContainer.querySelectorAll('.combatant-portrait__bonus');
    expect(frenchBonusElements[0]?.textContent).toBe('+1 280 PV');
    expect(frenchBonusElements[1]?.textContent).toBe('+15 % Critique');
    expect(frenchContainer.querySelector('.combatant-portrait__bonus-overflow')?.textContent).toBe(
      '+1 280',
    );

    cleanup();
    setStoredLocale('en-US');
    vi.resetModules();
    const [englishModule, englishPresenter] = await Promise.all([
      import('@/components/CombatUI/CombatantPortrait'),
      import('@/pages/combat/combatPresenter'),
    ]);
    const englishBonuses = [
      englishPresenter.formatCombatFlatBonus(1280, 'HP'),
      englishPresenter.formatCombatPercentageBonus(0.15, 'Critical strike'),
      'Bonus',
      ...Array.from({ length: 1280 }, () => 'Hidden bonus'),
    ];
    const { container: englishContainer } = render(
      <englishModule.CombatantPortrait
        combatant={largePortrait}
        isActive={false}
        enhancementBonuses={englishBonuses}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Target Lux' })).toBeInTheDocument();
    const englishHealth = screen.getByRole('progressbar', { name: "Lux's HP" });
    const englishMana = screen.getByRole('progressbar', { name: "Lux's MP" });
    expect(englishHealth).toHaveAttribute('aria-valuenow', '1280');
    expect(englishHealth).toHaveAttribute('aria-valuemax', '2400');
    expect(englishMana).toHaveAttribute('aria-valuenow', '1300');
    expect(englishMana).toHaveAttribute('aria-valuemax', '2500');
    expect(
      englishContainer.querySelector('.combatant-portrait__meter-label--health')?.textContent,
    ).toBe('1,280 / 2,400');
    expect(
      englishContainer.querySelector('.combatant-portrait__meter-label--mana')?.textContent,
    ).toBe('1,300 / 2,500');
    const englishBonusElements = englishContainer.querySelectorAll('.combatant-portrait__bonus');
    expect(englishBonusElements[0]?.textContent).toBe('+1,280 HP');
    expect(englishBonusElements[1]?.textContent).toBe('+15% Critical strike');
    expect(englishContainer.querySelector('.combatant-portrait__bonus-overflow')?.textContent).toBe(
      '+1,280',
    );
  });

  it('contains no raw user copy in the complete combat presentation scope', () => {
    const findings = COMBAT_SOURCE_FILES.flatMap((path) =>
      scanUserCopyFile(`${process.cwd()}/${path}`, {
        additionalInvariantTokens: ['CMD', 'VS', 'ms', 'x'],
      }),
    );
    expect(findings).toEqual([]);
  });
});
