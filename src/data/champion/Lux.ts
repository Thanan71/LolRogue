/**
 * Lux — the Lady of Luminosity
 * Role: Mage / Support | Resource: Mana
 *
 * Passive: Illumination — Damaging spells mark targets. Next attack detonates for bonus magic damage.
 * Q: Light Binding — Snare up to 2 enemies.
 * W: Prismatic Barrier — Shield throw (goes out and back).
 * E: Lucent Singularity — AoE slow, detonate for damage.
 * R: Final Spark — Long range laser beam.
 */

import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

export const lux: Champion = {
  id: 'Lux',
  key: '99',
  name: 'Lux',
  title: 'Dame de lumière',
  tags: ['Mage', 'Support'],
  resourceType: 'Mana',
  stats: {
    hp: 580,
    mp: 440,
    moveSpeed: 330,
    armor: 21,
    magicResist: 30,
    attackDamage: 54,
    attackSpeed: 0.669,
    attackRange: 550,
    hpPerLevel: 99,
    mpPerLevel: 23.5,
    armorPerLevel: 5.2,
    magicResistPerLevel: 1.3,
    attackDamagePerLevel: 3.3,
    attackSpeedPerLevel: 3,
    hpRegen: 5.5,
    hpRegenPerLevel: 0.55,
    mpRegen: 9,
    mpRegenPerLevel: 0.8,
    crit: 0,
    critPerLevel: 0,
  },
  spells: [
    {
      id: 'LuxLightBinding',
      name: 'Entrave de lumière',
      description:
        'Lux projette une sphère de lumière qui immobilise et blesse jusqu à deux unités ennemies.',
      maxRank: 5,
      cooldown: [11, 10.5, 10, 9.5, 9],
      cost: [50, 50, 50, 50, 50],
      range: [1175, 1175, 1175, 1175, 1175],
      image: 'LuxLightBinding.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0, apRatio: 0.6 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.6,
          baseDamage: [80, 120, 160, 200, 240],
        },
        { type: 'cc', ccType: 'snare', ccDuration: 2 },
      ],
    },
    {
      id: 'LuxPrismaticWave',
      name: 'Barrière prismatique',
      description:
        'Lux lance son bâton et courbe la lumière autour des cibles alliées, les protégeant contre les dégâts.',
      maxRank: 5,
      cooldown: [14, 13, 12, 11, 10],
      cost: [60, 65, 70, 75, 80],
      range: [1150, 1150, 1150, 1150, 1150],
      image: 'LuxPrismaticWave.png',
      targeting: TargetingType.Ally,
      scaling: { adRatio: 0, apRatio: 0.35 },
      effects: [{ type: 'shield', baseValue: [50, 70, 90, 110, 130], apRatio: 0.35 }],
    },
    {
      id: 'LuxLightStrikeKugel',
      name: 'Anomalie radieuse',
      description:
        'Crée une anomalie lumineuse ralentissant les ennemis. Peut être détonée pour infliger des dégâts.',
      maxRank: 5,
      cooldown: [10, 9.5, 9, 8.5, 8],
      cost: [70, 80, 90, 100, 110],
      range: [1100, 1100, 1100, 1100, 1100],
      image: 'LuxLightStrikeKugel.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 0.7 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.7,
          baseDamage: [60, 105, 150, 195, 240],
        },
        { type: 'cc', ccType: 'slow', slowPercent: 25, ccDuration: 2 },
      ],
    },
    {
      id: 'LuxR',
      name: 'Éclat final',
      description:
        'Lux tire un rayon lumineux qui inflige des dégâts à toutes les cibles dans la zone. Déclenche la passive Illumination.',
      maxRank: 3,
      cooldown: [80, 60, 40],
      cost: [100, 100, 100],
      range: [3340, 3340, 3340],
      image: 'LuxR.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 1.0 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 1.0,
          baseDamage: [300, 400, 500],
        },
      ],
    },
  ],
  passive: {
    name: 'Illumination',
    description:
      'Les compétences de Lux marquent la cible pendant quelques secondes. La prochaine attaque de Lux inflige des dégâts magiques supplémentaires.',
    image: 'LuxIlluminatingFraulein.png',
    targeting: TargetingType.Passive,
    scaling: { adRatio: 0, apRatio: 0.2 },
    effects: [
      {
        type: 'damage',
        damageType: 'magical',
        adRatio: 0,
        apRatio: 0.2,
        baseDamage: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
      },
    ],
  },
  iconUrl: '/lol/data/img/champions/Lux.png',
};
