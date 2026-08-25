/**
 * Darius — the Hand of Noxus
 * Role: Fighter | Resource: Mana
 *
 * Passive: Hemorrhage — Attacks bleed enemies, stacking 5 times. At 5 stacks, Darius gains bonus AD.
 * Q: Decimate — AoE swing, heals on outer blade hit.
 * W: Crippling Strike — Empowered attack, slows.
 * E: Apprehend — Pull enemies, passive armor penetration.
 * R: Noxian Guillotine — True damage execute, resets on kill.
 */

import { riotChampionIconUrl } from '@/config/riotAssets';
import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

export const darius: Champion = {
  id: 'Darius',
  key: '122',
  name: 'Darius',
  title: 'Main de Noxus',
  tags: ['Fighter', 'Tank'],
  resourceType: 'Mana',
  stats: {
    hp: 652,
    mp: 263,
    moveSpeed: 340,
    armor: 37,
    magicResist: 32,
    attackDamage: 64,
    attackSpeed: 0.625,
    attackRange: 175,
    hpPerLevel: 114,
    mpPerLevel: 58,
    armorPerLevel: 5.2,
    magicResistPerLevel: 2.05,
    attackDamagePerLevel: 5,
    attackSpeedPerLevel: 1,
    hpRegen: 10,
    hpRegenPerLevel: 0.95,
    mpRegen: 6.6,
    mpRegenPerLevel: 0.35,
    crit: 0,
    critPerLevel: 0,
  },
  spells: [
    {
      id: 'DariusCleave',
      name: 'Décimation',
      description:
        'Darius donne un coup circulaire avec sa hache. Les ennemis touchés par la lame subissent plus de dégâts. Darius récupère des PV par champion touché par la lame.',
      maxRank: 5,
      cooldownTurns: [3, 2, 2, 2, 2],
      cost: [25, 30, 35, 40, 45],
      range: [425, 425, 425, 425, 425],
      image: 'DariusCleave.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 1.0, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'physical',
          adRatio: 1.0,
          apRatio: 0,
          baseDamage: [40, 70, 100, 130, 160],
        },
        { type: 'heal', baseValue: [13, 15, 17, 19, 21], apRatio: 0 },
      ],
    },
    {
      id: 'DariusNoxianTacticsONH',
      name: 'Estropiaison',
      description:
        'La prochaine attaque de Darius tranche une artère vitale, infligeant des dégâts bonus et ralentissant la cible.',
      maxRank: 5,
      cooldownTurns: [2, 2, 2, 2, 2],
      cost: [40, 40, 40, 40, 40],
      range: [300, 300, 300, 300, 300],
      image: 'DariusNoxianTacticsONH.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0.5, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'physical',
          adRatio: 0.5,
          apRatio: 0,
          baseDamage: [30, 40, 50, 60, 70],
        },
        { type: 'cc', ccType: 'slow', slowPercent: 90, ccDuration: 1 },
      ],
    },
    {
      id: 'DariusAxeGrabCone',
      name: 'Crampon',
      description:
        'Darius aiguise sa hache, ignorant passivement un pourcentage de l armure. À l activation, il attire les ennemis avec sa hache.',
      maxRank: 5,
      cooldownTurns: [5, 5, 5, 5, 5],
      cost: [70, 60, 50, 40, 30],
      range: [535, 535, 535, 535, 535],
      image: 'DariusAxeGrabCone.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0, apRatio: 0 },
      passiveArmorPenetrationPercent: [15, 20, 25, 30, 35],
      effects: [{ type: 'cc', ccType: 'snare', ccDuration: 1 }],
    },
    {
      id: 'DariusExecute',
      name: 'Guillotine noxienne',
      description:
        'Darius saute sur un champion ennemi et donne un coup fatal, infligeant des dégâts bruts. Plus de Plaies béantes = plus de dégâts. Si la cible est tuée, le délai est annulé.',
      maxRank: 3,
      cooldownTurns: [8, 7, 6],
      cost: [100, 100, 0],
      range: [460, 460, 460],
      image: 'DariusExecute.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0.75, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'true',
          adRatio: 0.75,
          apRatio: 0,
          baseDamage: [100, 200, 300],
        },
      ],
    },
  ],
  passive: {
    name: 'Plaie béante',
    description:
      'Les attaques de Darius et ses compétences font saigner les ennemis pendant 5 tours (9 dégâts physiques par charge et par tour au niveau 1, cumulable 5 fois). À 5 charges, Darius gagne un bonus en dégâts d attaque.',
    image: 'Darius_Icon_Hemorrhage.png',
    targeting: TargetingType.Passive,
    scaling: { adRatio: 0, apRatio: 0 },
    effects: [
      {
        type: 'dot',
        damageType: 'physical',
        adRatio: 0,
        apRatio: 0,
        // Total damage per charge over five ticks: 45 / 5 = 9 at level 1.
        baseDamage: [45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89, 93, 97, 101, 105, 109, 113],
        duration: 5,
        maxStacks: 5,
      },
      {
        type: 'buff',
        stat: 'attackDamage',
        modifierType: 'percent',
        values: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
        buffDuration: 5,
      },
    ],
  },
  iconUrl: riotChampionIconUrl('Darius'),
};
