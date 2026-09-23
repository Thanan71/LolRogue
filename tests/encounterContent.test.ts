import { describe, expect, it } from 'vitest';
import type { EncounterType, EventOutcomeType } from '@/game/map/types';
import {
  type EncounterPresentationSource,
  getEncounterPresentation,
  getEventOutcomeDescription,
  getEventOutcomePresentation,
} from '@/i18n/encounterContent';
import type { Biome } from '@/types/run';

const BIOMES = {
  top_lane: { english: 'top lane', french: 'la voie du haut' },
  jungle: { english: 'jungle', french: 'la jungle' },
  mid_lane: { english: 'mid lane', french: 'la voie du milieu' },
  bot_lane: { english: 'bot lane', french: 'la voie du bas' },
  river: { english: 'river', french: 'la rivière' },
  base: { english: 'base', french: 'la base' },
} as const satisfies Record<Biome, { english: string; french: string }>;

const SHOPS = {
  top_lane: ['The Armory', 'L’Armurerie'],
  jungle: ['Nomad Trader', 'Marchand nomade'],
  mid_lane: ['Arcane Emporium', 'Échoppe arcanique'],
  bot_lane: ['Market Stalls', 'Étals du marché'],
  river: ['River Merchant', 'Marchand de la rivière'],
  base: ['Black Market', 'Marché noir'],
} as const satisfies Record<Biome, readonly [string, string]>;

const REST_NAMES = [
  ['Campfire', 'Feu de camp'],
  ['Meditation Shrine', 'Sanctuaire de méditation'],
  ['Healing Spring', 'Source de guérison'],
  ['Safe Haven', 'Havre sûr'],
  ['Temple of Renewal', 'Temple du renouveau'],
] as const;

const REST_DESCRIPTIONS = [
  [
    'A sacred place that fully restores your team.',
    'Un lieu sacré qui restaure entièrement votre équipe.',
  ],
  ['A moment of respite to tend your wounds.', 'Un moment de répit pour soigner vos blessures.'],
] as const;

const EVENTS = [
  [
    'Mysterious Chest',
    'A glowing chest sits in your path. Do you open it?',
    'Coffre mystérieux',
    'Un coffre lumineux bloque votre chemin. Oserez-vous l’ouvrir ?',
  ],
  [
    'Wandering Spirit',
    'A friendly spirit offers to help your team.',
    'Esprit errant',
    'Un esprit bienveillant propose son aide à votre équipe.',
  ],
  [
    'Runic Altar',
    'An ancient altar pulses with power.',
    'Autel runique',
    'Un autel ancien palpite d’une puissance oubliée.',
  ],
  [
    'Loot Goblin',
    'A small creature scurries past with a bag of gold!',
    'Gobelin au butin',
    'Une petite créature détale devant vous avec un sac rempli d’or !',
  ],
] as const;

const EVENT_OUTCOMES = {
  gold_reward: [
    ['You find gold inside!', 'Vous découvrez de l’or à l’intérieur.'],
    ['The spirit drops gold.', 'L’esprit dépose quelques pièces d’or.'],
    ['You catch the goblin!', 'Vous rattrapez le gobelin !'],
  ],
  gold_cost: [['The altar demands an offering.', 'L’autel exige une offrande.']],
  item_reward: [
    ['An item glows inside!', 'Un objet scintille à l’intérieur.'],
    ['The goblin drops its bag!', 'Le gobelin abandonne son sac !'],
  ],
  heal: [['The spirit heals your team!', 'L’esprit soigne votre équipe.']],
  damage: [['A trap! The chest explodes!', 'Un piège ! Le coffre explose.']],
  champion_recruit: [['A champion appears from the altar!', 'Un champion émerge de l’autel !']],
  stat_boost: [
    ['The spirit empowers your team!', 'L’esprit renforce votre équipe.'],
    ['The altar grants you strength!', 'L’autel vous confère une force nouvelle.'],
  ],
  nothing: [
    ['The chest is empty...', 'Le coffre est vide…'],
    [
      'The goblin escapes too fast...',
      'Le gobelin s’échappe avant que vous ne puissiez l’atteindre…',
    ],
  ],
} as const satisfies Record<EventOutcomeType, readonly (readonly [string, string])[]>;

const TREASURES = [
  ['Shimmering Chest', 'Coffre scintillant', 'un coffre scintillant'],
  ['Golden Cache', 'Cache dorée', 'une cache dorée'],
  ['Forgotten Hoard', 'Trésor oublié', 'un trésor oublié'],
  ['Mystic Treasure', 'Trésor mystique', 'un trésor mystique'],
  ['Ancient Stash', 'Ancienne réserve', 'une ancienne réserve'],
  ['Goblin Stash', 'Cache du gobelin', 'une cache de gobelin'],
  ["Dragon's Bounty", 'Butin du dragon', 'le butin d’un dragon'],
] as const;

function expectCatalogPresentation(
  source: EncounterPresentationSource,
  frenchName: string,
  frenchDescription: string,
): void {
  expect(getEncounterPresentation('en-US', source)).toEqual({
    name: source.name,
    description: source.description,
    resolution: 'catalog',
  });
  expect(getEncounterPresentation('fr-FR', source)).toEqual({
    name: frenchName,
    description: frenchDescription,
    resolution: 'catalog',
  });
}

describe('encounter presentation catalog', () => {
  it('covers every shop biome canonical pair', () => {
    for (const biome of Object.keys(BIOMES) as Biome[]) {
      const [englishName, frenchName] = SHOPS[biome];
      expectCatalogPresentation(
        {
          type: 'shop',
          name: englishName,
          description: `A merchant appears with wares from the ${BIOMES[biome].english}.`,
        },
        frenchName,
        `Un marchand apparaît avec des marchandises venues de ${BIOMES[biome].french}.`,
      );
    }
  });

  it('covers every rest name and description emitted independently by the generator', () => {
    for (const [englishName, frenchName] of REST_NAMES) {
      for (const [englishDescription, frenchDescription] of REST_DESCRIPTIONS) {
        expectCatalogPresentation(
          { type: 'rest', name: englishName, description: englishDescription },
          frenchName,
          frenchDescription,
        );
      }
    }
  });

  it('covers dynamic recruit copy while leaving the champion identifier untouched', () => {
    const source = {
      type: 'recruit',
      championId: 'KaiSa',
      name: 'Wild KaiSa',
      description: 'KaiSa appears and may join your team... for a price.',
    } as const;

    expectCatalogPresentation(
      source,
      'Champion sauvage : KaiSa',
      'KaiSa apparaît et pourrait rejoindre votre équipe… contre rémunération.',
    );
  });

  it('covers every treasure name and biome template pair', () => {
    for (const [englishName, frenchName, frenchSubject] of TREASURES) {
      for (const biome of Object.keys(BIOMES) as Biome[]) {
        expectCatalogPresentation(
          {
            type: 'treasure',
            name: englishName,
            description: `A ${englishName.toLowerCase()} glimmers in the ${BIOMES[biome].english}.`,
          },
          frenchName,
          `Vous apercevez ${frenchSubject} dans ${BIOMES[biome].french}.`,
        );
      }
    }
  });

  it('covers all event names, descriptions, outcome IDs and outcome descriptions', () => {
    for (const [englishName, englishDescription, frenchName, frenchDescription] of EVENTS) {
      expectCatalogPresentation(
        { type: 'event', name: englishName, description: englishDescription },
        frenchName,
        frenchDescription,
      );
    }

    for (const outcomeType of Object.keys(EVENT_OUTCOMES) as EventOutcomeType[]) {
      for (const [englishDescription, frenchDescription] of EVENT_OUTCOMES[outcomeType]) {
        const source = { type: outcomeType, description: englishDescription };
        expect(getEventOutcomePresentation('en-US', source)).toEqual({
          description: englishDescription,
          resolution: 'catalog',
        });
        expect(getEventOutcomePresentation('fr-FR', source)).toEqual({
          description: frenchDescription,
          resolution: 'catalog',
        });
        expect(getEventOutcomeDescription('fr-FR', source)).toBe(frenchDescription);
      }
    }
  });

  it('uses localized, type-specific fallbacks instead of leaking unknown canonical copy', () => {
    const expectedFrenchFallbacks = {
      combat: ['Combat', 'Une équipe ennemie bloque votre chemin.'],
      shop: ['Boutique', 'Un marchand propose ses marchandises.'],
      recruit: ['Recrutement', 'Un champion pourrait rejoindre votre équipe.'],
      event: ['Événement mystérieux', 'Une rencontre inattendue se présente.'],
      rest: ['Halte', 'Votre équipe trouve un lieu où reprendre des forces.'],
      treasure: ['Trésor', 'Un trésor attend votre équipe.'],
    } as const satisfies Record<EncounterType, readonly [string, string]>;

    for (const type of Object.keys(expectedFrenchFallbacks) as EncounterType[]) {
      const result = getEncounterPresentation('fr-FR', {
        type,
        name: 'Unknown English name',
        description: 'Unknown English description',
      });
      expect(result).toEqual({
        name: expectedFrenchFallbacks[type][0],
        description: expectedFrenchFallbacks[type][1],
        resolution: 'fallback',
      });
      expect(result.name).not.toContain('Unknown');
      expect(result.description).not.toContain('Unknown');
    }

    const englishFallback = getEncounterPresentation('en-US', {
      type: 'shop',
      name: 'Nom inconnu',
      description: 'Description inconnue',
    });
    expect(englishFallback).toEqual({
      name: 'Shop',
      description: 'A merchant offers their wares.',
      resolution: 'fallback',
    });

    for (const type of Object.keys(EVENT_OUTCOMES) as EventOutcomeType[]) {
      const result = getEventOutcomePresentation('fr-FR', {
        type,
        description: 'Unknown English outcome',
      });
      expect(result.resolution).toBe('fallback');
      expect(result.description).not.toContain('Unknown');
    }
  });
});
