/**
 * Ashe — the Frost Archer
 * Role: Marksman | Resource: Mana
 *
 * Passive: Frost Shot — Attacks slow and deal bonus damage to slowed targets.
 * Q: Ranger's Focus — Attack speed buff + flurry.
 * W: Volley — Cone AoE arrows, applies slow.
 * E: Hawkshot — Reveals an area.
 * R: Enchanted Crystal Arrow — Global stun + AoE slow.
 */

import { riotChampionIconUrl } from '@/config/riotAssets';
import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

export const ashe: Champion = {
  id: 'Ashe',
  key: '22',
  name: 'Ashe',
  title: 'Archère de givre',
  tags: ['Marksman'],
  resourceType: 'Mana',
  stats: {
    hp: 610,
    mp: 280,
    moveSpeed: 325,
    armor: 26,
    magicResist: 30,
    attackDamage: 59,
    attackSpeed: 0.658,
    attackRange: 600,
    hpPerLevel: 101,
    mpPerLevel: 35,
    armorPerLevel: 4.6,
    magicResistPerLevel: 1.3,
    attackDamagePerLevel: 2.96,
    attackSpeedPerLevel: 3.33,
    hpRegen: 3.5,
    hpRegenPerLevel: 0.55,
    mpRegen: 7,
    mpRegenPerLevel: 0.65,
    crit: 0,
    critPerLevel: 0,
  },
  spells: [
    {
      id: 'AsheQ',
      name: 'Concentration du ranger',
      description:
        'Ashe génère des effets Concentration. Au maximum, elle augmente son initiative d attaque et transforme son attaque en volée de flèches.',
      maxRank: 5,
      cooldownTurns: [2, 2, 2, 2, 2],
      cost: [30, 30, 30, 30, 30],
      range: [400, 400, 400, 400, 400],
      image: 'AsheQ.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0.25, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'physical',
          adRatio: 0.25,
          apRatio: 0,
          baseDamage: [4, 4, 4, 4, 4],
        },
        {
          type: 'buff',
          stat: 'attackSpeed',
          modifierType: 'percent',
          values: [20, 25, 30, 35, 40],
          buffDuration: 4,
        },
      ],
    },
    {
      id: 'Volley',
      name: 'Salve',
      description:
        'Ashe tire des flèches dans une zone conique pour infliger des dégâts bonus et ralentir les cibles.',
      maxRank: 5,
      cooldownTurns: [5, 4, 3, 2, 2],
      cost: [75, 70, 65, 60, 55],
      range: [1200, 1200, 1200, 1200, 1200],
      image: 'Volley.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 1.0, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'physical',
          adRatio: 1.0,
          apRatio: 0,
          baseDamage: [20, 35, 50, 65, 80],
        },
        { type: 'cc', ccType: 'slow', slowPercent: 30, ccDuration: 2 },
      ],
    },
    {
      id: 'AsheSpiritOfTheHawk',
      name: 'Rapace',
      description: 'Ashe envoie son faucon en reconnaissance, révélant une zone de la carte.',
      maxRank: 5,
      cooldownTurns: [2, 2, 2, 2, 2],
      cost: [0, 0, 0, 0, 0],
      range: [25000, 25000, 25000, 25000, 25000],
      image: 'AsheSpiritOfTheHawk.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [],
    },
    {
      id: 'EnchantedCrystalArrow',
      name: 'Flèche de cristal enchantée',
      description:
        'Ashe tire un trait de glace en ligne droite. Si la flèche touche un champion, elle l étourdit (durée augmentant avec la distance) et inflige des dégâts.',
      maxRank: 3,
      cooldownTurns: [7, 6, 6],
      cost: [100, 100, 100],
      range: [25000, 25000, 25000],
      image: 'EnchantedCrystalArrow.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 1.0 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 1.0,
          baseDamage: [200, 400, 600],
        },
        { type: 'cc', ccType: 'stun', ccDuration: 3.5 },
      ],
    },
  ],
  passive: {
    name: 'Tir givrant',
    description:
      'Les attaques d Ashe ralentissent ses cibles et infligent des dégâts supplémentaires aux cibles affectées par le ralentissement.',
    image: 'Ashe_P.png',
    targeting: TargetingType.Passive,
    scaling: { adRatio: 0, apRatio: 0 },
    effects: [{ type: 'cc', ccType: 'slow', slowPercent: 20, ccDuration: 2 }],
  },
  iconUrl: riotChampionIconUrl('Ashe'),
};
