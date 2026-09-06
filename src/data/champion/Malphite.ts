/**
 * Malphite — Shard of the Monolith
 * Role: Tank | Resource: Mana
 *
 * Passive: Granite Shield — Absorbs damage equal to % max HP, regenerates out of combat.
 * Q: Seismic Shard — Magic damage + steals MS.
 * W: Thunderclap — AoE physical damage on attacks.
 * E: Ground Slam — AoE magic damage scaling with armor, reduces AS.
 * R: Unstoppable Force — AoE knockup + magic damage.
 */

import { riotChampionIconUrl } from '@/config/riotAssets';
import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

export const malphite: Champion = {
  id: 'Malphite',
  key: '54',
  name: 'Malphite',
  title: 'Éclat du monolithe',
  tags: ['Tank', 'Mage'],
  resourceType: 'Mana',
  stats: {
    hp: 560,
    mp: 280,
    moveSpeed: 335,
    armor: 34,
    magicResist: 28,
    attackDamage: 62,
    attackSpeed: 0.736,
    attackRange: 125,
    hpPerLevel: 104,
    mpPerLevel: 60,
    armorPerLevel: 4.95,
    magicResistPerLevel: 2.05,
    attackDamagePerLevel: 4,
    attackSpeedPerLevel: 3.4,
    hpRegen: 7,
    hpRegenPerLevel: 0.55,
    mpRegen: 7.3,
    mpRegenPerLevel: 0.55,
    crit: 0,
    critPerLevel: 0,
  },
  spells: [
    {
      id: 'SeismicShard',
      name: 'Éclat sismique',
      description:
        'Malphite envoie un éclat de terre, infligeant des dégâts et volant la vitesse de déplacement de la cible pendant 3 sec.',
      maxRank: 5,
      cooldownTurns: [3, 3, 3, 2, 2],
      cost: [70, 75, 80, 85, 90],
      range: [625, 625, 625, 625, 625],
      image: 'SeismicShard.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0.3, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0.3,
          apRatio: 0,
          baseDamage: [35, 80, 125, 170, 215],
        },
        { type: 'cc', ccType: 'slow', slowPercent: 30, ccDuration: 3 },
        {
          type: 'buff',
          stat: 'moveSpeed',
          modifierType: 'percent',
          values: [20, 25, 30, 35, 40],
          buffDuration: 3,
        },
      ],
    },
    {
      id: 'Obduracy',
      name: 'Coup de tonnerre',
      description:
        'Pendant quelques secondes, les attaques de Malphite produisent des ondes de choc devant lui.',
      maxRank: 5,
      cooldownTurns: [3, 3, 3, 3, 3],
      cost: [30, 35, 40, 45, 50],
      range: [400, 400, 400, 400, 400],
      image: 'Obduracy.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0.15, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'physical',
          adRatio: 0.15,
          apRatio: 0,
          baseDamage: [15, 30, 45, 60, 75],
        },
        {
          type: 'buff',
          stat: 'armor',
          modifierType: 'percent',
          values: [10, 15, 20, 25, 30],
          buffDuration: 5,
        },
      ],
    },
    {
      id: 'Landslide',
      name: 'Choc au sol',
      description:
        'Malphite frappe le sol, infligeant des dégâts magiques en fonction de son armure et ralentissant les ennemis.',
      maxRank: 5,
      cooldownTurns: [2, 2, 2, 2, 2],
      cost: [50, 55, 60, 65, 70],
      range: [400, 400, 400, 400, 400],
      image: 'Landslide.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 0.2 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.2,
          baseDamage: [20, 55, 90, 125, 160],
        },
        { type: 'cc', ccType: 'slow', slowPercent: 30, ccDuration: 3 },
      ],
    },
    {
      id: 'UFSlash',
      name: 'Force indomptable',
      description:
        'Malphite fonce vers une position à grande vitesse, blessant les ennemis et les projetant dans les airs.',
      maxRank: 3,
      cooldownTurns: [9, 7, 6],
      cost: [100, 100, 100],
      range: [1000, 1000, 1000],
      image: 'UFSlash.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 1.0 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 1.0,
          baseDamage: [150, 250, 350],
        },
        { type: 'cc', ccType: 'knockup', ccDuration: 1 },
      ],
    },
  ],
  passive: {
    name: 'Bouclier de granit',
    description:
      'Malphite est protégé par un bouclier de roche qui absorbe des dégâts équivalents à 7% de ses PV max. Si Malphite n est pas touché pendant quelques secondes, l effet se recharge.',
    image: 'Malphite_GraniteShield.png',
    targeting: TargetingType.Passive,
    scaling: { adRatio: 0, apRatio: 0 },
    effects: [
      {
        type: 'shield',
        baseValue: [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7],
        apRatio: 0,
      },
    ],
  },
  iconUrl: riotChampionIconUrl('Malphite'),
};
