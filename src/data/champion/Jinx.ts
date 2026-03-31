/**
 * Jinx — the Loose Cannon
 * Role: Marksman | Resource: Mana
 *
 * Passive: Get Excited! — Gains massive AS/MS on kill or assist.
 * Q: Switcheroo! — Toggle between minigun (AS) and rockets (range/AoE).
 * W: Zap! — Long range line skillshot, slows + reveals.
 * E: Flame Chompers! — Grenades that root enemies.
 * R: Super Mega Death Rocket! — Global execute damage.
 */

import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

export const jinx: Champion = {
  id: 'Jinx',
  key: '222',
  name: 'Jinx',
  title: 'Gâchette folle',
  tags: ['Marksman'],
  resourceType: 'Mana',
  stats: {
    hp: 630, mp: 260, moveSpeed: 325, armor: 26, magicResist: 30,
    attackDamage: 59, attackSpeed: 0.625, attackRange: 525,
    hpPerLevel: 105, mpPerLevel: 50, armorPerLevel: 4.2, magicResistPerLevel: 1.3,
    attackDamagePerLevel: 3.15, attackSpeedPerLevel: 1,
    hpRegen: 3.75, hpRegenPerLevel: 0.5, mpRegen: 6.7, mpRegenPerLevel: 1,
    crit: 0, critPerLevel: 0,
  },
  spells: [
    {
      id: 'JinxQ', name: 'Flip flap !',
      description: 'Jinx alterne entre Bang-Bang (minigun, bonus vitesse d attaque) et Poiscaille (lance-roquettes, dégâts de zone et plus grande portée).',
      maxRank: 5, cooldown: [0.9, 0.9, 0.9, 0.9, 0.9], cost: [20, 20, 20, 20, 20], range: [600, 600, 600, 600, 600],
      image: 'JinxQ.png', targeting: TargetingType.Self, scaling: { adRatio: 0, apRatio: 0 },
      effects: [
        { type: 'buff', stat: 'attackSpeed', modifierType: 'percent', values: [30, 55, 80, 105, 130], buffDuration: 2.5 },
        { type: 'damage', damageType: 'physical', adRatio: 1.1, apRatio: 0, baseDamage: [10, 10, 10, 10, 10] },
      ],
    },
    {
      id: 'JinxW', name: 'Zap !',
      description: 'Jinx tire un rayon qui inflige des dégâts au premier ennemi touché, le ralentit et le révèle.',
      maxRank: 5, cooldown: [8, 7, 6, 5, 4], cost: [40, 45, 50, 55, 60], range: [1450, 1450, 1450, 1450, 1450],
      image: 'JinxW.png', targeting: TargetingType.Enemy, scaling: { adRatio: 1.4, apRatio: 0 },
      effects: [
        { type: 'damage', damageType: 'physical', adRatio: 1.4, apRatio: 0, baseDamage: [10, 60, 110, 160, 210] },
        { type: 'cc', ccType: 'slow', slowPercent: 40, ccDuration: 2 },
      ],
    },
    {
      id: 'JinxE', name: 'Pyromâcheurs !',
      description: 'Jinx lance des grenades immobilisantes qui explosent au bout de 5 sec. Les champions qui marchent dessus sont immobilisés.',
      maxRank: 5, cooldown: [24, 20.5, 17, 13.5, 10], cost: [90, 90, 90, 90, 90], range: [925, 925, 925, 925, 925],
      image: 'JinxE.png', targeting: TargetingType.Area, scaling: { adRatio: 0, apRatio: 1.0 },
      effects: [
        { type: 'damage', damageType: 'magical', adRatio: 0, apRatio: 1.0, baseDamage: [70, 120, 170, 220, 270] },
        { type: 'cc', ccType: 'snare', ccDuration: 1.5 },
      ],
    },
    {
      id: 'JinxR', name: 'Super roquette de la mort !',
      description: 'Jinx tire une super roquette qui traverse la carte. Les dégâts augmentent pendant le trajet et sont amplifiés par les PV manquants.',
      maxRank: 3, cooldown: [90, 75, 60], cost: [100, 100, 100], range: [25000, 25000, 25000],
      image: 'JinxR.png', targeting: TargetingType.Area, scaling: { adRatio: 1.0, apRatio: 0 },
      effects: [
        { type: 'damage', damageType: 'physical', adRatio: 1.0, apRatio: 0, baseDamage: [250, 350, 450] },
        { type: 'execute', threshold: 25 },
      ],
    },
  ],
  passive: {
    name: 'Enthousiasme !',
    description: 'Jinx reçoit un bonus en vitesse de déplacement et en vitesse d attaque quand elle participe à l élimination d un champion, monstre épique ou bâtiment.',
    image: 'Jinx_Passive.png', targeting: TargetingType.Passive, scaling: { adRatio: 0, apRatio: 0 },
    effects: [
      { type: 'buff', stat: 'moveSpeed', modifierType: 'percent', values: [175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175], buffDuration: 6 },
      { type: 'buff', stat: 'attackSpeed', modifierType: 'percent', values: [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25], buffDuration: 6 },
    ],
  },
  iconUrl: '/lol/data/img/champions/Jinx.png',
};
