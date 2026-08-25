/**
 * Soraka — the Starchild
 * Role: Support | Resource: Mana
 *
 * Passive: Salvation — Moves faster toward low-HP allies.
 * Q: Starcall — AoE star fall, heals Soraka on champion hit.
 * W: Astral Infusion — Sacrifice HP to heal an ally.
 * E: Equinox — AoE silence, then root.
 * R: Wish — Global heal to all allies.
 */

import { riotChampionIconUrl } from '@/config/riotAssets';
import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

export const soraka: Champion = {
  id: 'Soraka',
  key: '16',
  name: 'Soraka',
  title: 'Enfant des étoiles',
  tags: ['Support', 'Mage'],
  resourceType: 'Mana',
  stats: {
    hp: 605,
    mp: 425,
    moveSpeed: 325,
    armor: 32,
    magicResist: 30,
    attackDamage: 50,
    attackSpeed: 0.625,
    attackRange: 550,
    hpPerLevel: 88,
    mpPerLevel: 40,
    armorPerLevel: 5,
    magicResistPerLevel: 1.3,
    attackDamagePerLevel: 3,
    attackSpeedPerLevel: 2.14,
    hpRegen: 2.5,
    hpRegenPerLevel: 0.5,
    mpRegen: 11.5,
    mpRegenPerLevel: 0.4,
    crit: 0,
    critPerLevel: 0,
  },
  spells: [
    {
      id: 'SorakaQ',
      name: 'Appel de l étoile',
      description:
        'Une étoile s abat à l endroit ciblé, infligeant des dégâts magiques et ralentissant. Si un champion est touché, Soraka récupère des PV.',
      maxRank: 5,
      cooldownTurns: [2, 2, 2, 2, 2],
      cost: [45, 50, 55, 60, 65],
      range: [810, 810, 810, 810, 810],
      image: 'SorakaQ.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 0.4 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.4,
          baseDamage: [85, 120, 155, 190, 225],
        },
        { type: 'cc', ccType: 'slow', slowPercent: 30, ccDuration: 2 },
        { type: 'heal', baseValue: [50, 65, 80, 95, 110], apRatio: 0.3 },
      ],
    },
    {
      id: 'SorakaW',
      name: 'Infusion astrale',
      description: 'Soraka sacrifie une partie de ses PV pour soigner un champion allié.',
      maxRank: 5,
      cooldownTurns: [2, 2, 2, 2, 2],
      cost: [40, 45, 50, 55, 60],
      range: [550, 550, 550, 550, 550],
      image: 'SorakaW.png',
      targeting: TargetingType.Ally,
      scaling: { adRatio: 0, apRatio: 0.6 },
      effects: [{ type: 'heal', baseValue: [80, 110, 140, 170, 200], apRatio: 0.6 }],
    },
    {
      id: 'SorakaE',
      name: 'Équinoxe',
      description:
        'Crée une zone qui réduit au silence et ralentit les ennemis de 30% pendant un tour.',
      maxRank: 5,
      cooldownTurns: [5, 5, 5, 5, 4],
      cost: [70, 75, 80, 85, 90],
      range: [925, 925, 925, 925, 925],
      image: 'SorakaE.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 0.4 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.4,
          baseDamage: [70, 110, 150, 190, 230],
        },
        { type: 'cc', ccType: 'silence', ccDuration: 1 },
        { type: 'cc', ccType: 'slow', slowPercent: 30, ccDuration: 1 },
      ],
    },
    {
      id: 'SorakaR',
      name: 'Souhait',
      description:
        'Soraka remplit ses alliés d espoir, rendant immédiatement des PV à tous les champions alliés.',
      maxRank: 3,
      cooldownTurns: [10, 9, 8],
      cost: [100, 100, 100],
      range: [25000, 25000, 25000],
      image: 'SorakaR.png',
      targeting: TargetingType.Allies,
      scaling: { adRatio: 0, apRatio: 0.55 },
      effects: [{ type: 'heal', baseValue: [150, 250, 350], apRatio: 0.55 }],
    },
  ],
  passive: {
    name: 'Salut',
    description: 'Soraka court plus vite en direction des alliés affaiblis à proximité.',
    image: 'Soraka_Passive.png',
    targeting: TargetingType.Passive,
    scaling: { adRatio: 0, apRatio: 0 },
    effects: [
      {
        type: 'buff',
        stat: 'moveSpeed',
        modifierType: 'percent',
        values: [70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70],
        buffDuration: 0,
      },
    ],
  },
  iconUrl: riotChampionIconUrl('Soraka'),
};
