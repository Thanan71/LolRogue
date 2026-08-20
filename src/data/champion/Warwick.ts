/**
 * Warwick — the Uncaged Wrath of Zaun
 * Role: Fighter / Tank | Resource: Mana
 *
 * Passive: Eternal Hunger — Attacks deal bonus magic damage. Heals if below 50% HP.
 * Q: Jaws of the Beast — Bite for % max HP damage, heal.
 * W: Blood Hunt — MS/AS toward low-HP enemies.
 * E: Primal Howl — Damage reduction, then fear nearby enemies.
 * R: Infinite Duress — Suppress target, heal while channeling.
 */

import { riotChampionIconUrl } from '@/config/riotAssets';
import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

export const warwick: Champion = {
  id: 'Warwick',
  key: '19',
  name: 'Warwick',
  title: 'Fureur déchaînée de Zaun',
  tags: ['Fighter', 'Tank'],
  resourceType: 'Mana',
  stats: {
    hp: 620,
    mp: 280,
    moveSpeed: 335,
    armor: 33,
    magicResist: 32,
    attackDamage: 65,
    attackSpeed: 0.638,
    attackRange: 125,
    hpPerLevel: 99,
    mpPerLevel: 35,
    armorPerLevel: 4.4,
    magicResistPerLevel: 2.05,
    attackDamagePerLevel: 3,
    attackSpeedPerLevel: 2.3,
    hpRegen: 4,
    hpRegenPerLevel: 0.75,
    mpRegen: 7.45,
    mpRegenPerLevel: 0.6,
    crit: 0,
    critPerLevel: 0,
  },
  spells: [
    {
      id: 'WarwickQ',
      name: 'Dents de la bête',
      description:
        'Warwick mord sa cible, infligeant des dégâts en fonction des PV max de la cible et récupérant des PV.',
      maxRank: 5,
      cooldownTurns: [2, 2, 2, 2, 2],
      cost: [50, 60, 70, 80, 90],
      range: [350, 350, 350, 350, 350],
      image: 'WarwickQ.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 1.2, apRatio: 0.9 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 1.2,
          apRatio: 0.9,
          baseDamage: [6, 7, 8, 9, 10],
        },
        { type: 'heal', baseValue: [10, 20, 30, 40, 50], apRatio: 0.9 },
      ],
    },
    {
      id: 'WarwickW',
      name: 'Traque sanguinaire',
      description:
        'Warwick repère les ennemis ayant moins de 50% PV et obtient des bonus en vitesse de déplacement et vitesse d attaque contre eux.',
      maxRank: 5,
      cooldownTurns: [5, 5, 5, 5, 5],
      cost: [55, 55, 55, 55, 55],
      range: [4000, 4000, 4000, 4000, 4000],
      image: 'WarwickW.png',
      targeting: TargetingType.Self,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [
        {
          type: 'buff',
          stat: 'moveSpeed',
          modifierType: 'percent',
          values: [50, 55, 60, 65, 70],
          buffDuration: 8,
        },
        {
          type: 'buff',
          stat: 'attackSpeed',
          modifierType: 'percent',
          values: [50, 65, 80, 95, 110],
          buffDuration: 8,
        },
      ],
    },
    {
      id: 'WarwickE',
      name: 'Hurlement bestial',
      description:
        'Warwick gagne de la réduction des dégâts pendant 2.5 sec. À la fin, il hurle, effrayant les ennemis proches.',
      maxRank: 5,
      cooldownTurns: [4, 4, 4, 3, 3],
      cost: [40, 40, 40, 40, 40],
      range: [375, 375, 375, 375, 375],
      image: 'WarwickE.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [
        {
          type: 'buff',
          stat: 'armor',
          modifierType: 'percent',
          values: [35, 40, 45, 50, 55],
          buffDuration: 2.5,
        },
        { type: 'cc', ccType: 'stun', ccDuration: 1 },
      ],
    },
    {
      id: 'WarwickR',
      name: 'Contrainte infinie',
      description:
        'Warwick bondit dans une direction, neutralisant le premier champion touché pendant 1.5 sec et soignant ses dégâts.',
      maxRank: 3,
      cooldownTurns: [8, 6, 6],
      cost: [100, 100, 100],
      range: [25000, 25000, 25000],
      image: 'WarwickR.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 1.0, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 1.0,
          apRatio: 0,
          baseDamage: [175, 350, 525],
        },
        { type: 'cc', ccType: 'stun', ccDuration: 1.5 },
        { type: 'heal', baseValue: [100, 200, 300], apRatio: 0 },
      ],
    },
  ],
  passive: {
    name: 'Soif inextinguible',
    description:
      'Les attaques de base de Warwick infligent des dégâts magiques bonus. Si Warwick a moins de 50% PV, il récupère des PV équivalents à ces dégâts. En dessous de 25% PV, le soin est triplé.',
    image: 'WarwickP.png',
    targeting: TargetingType.Passive,
    scaling: { adRatio: 0, apRatio: 0.15 },
    effects: [
      {
        type: 'damage',
        damageType: 'magical',
        adRatio: 0,
        apRatio: 0.15,
        baseDamage: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      },
      {
        type: 'heal',
        baseValue: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        apRatio: 0.15,
      },
    ],
  },
  iconUrl: riotChampionIconUrl('Warwick'),
};
