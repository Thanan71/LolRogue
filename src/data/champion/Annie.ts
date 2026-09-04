/**
 * Annie — the Dark Child
 * Role: Mage | Resource: Mana
 *
 * Passive: Pyromanie — After 4 spells, next offensive spell stuns.
 * Q: Disintegrate — Point-and-click magic damage, mana refund on kill.
 * W: Incinerate — Cone AoE magic damage.
 * E: Molten Shield — Shield + MS buff on self or ally.
 * R: Summon: Tibbers — AoE magic damage summon.
 */

import { riotChampionIconUrl } from '@/config/riotAssets';
import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

export const annie: Champion = {
  id: 'Annie',
  key: '1',
  name: 'Annie',
  title: 'Enfant des ténèbres',
  tags: ['Mage'],
  resourceType: 'Mana',
  stats: {
    hp: 720,
    mp: 418,
    moveSpeed: 335,
    armor: 30,
    magicResist: 30,
    attackDamage: 50,
    attackSpeed: 0.61,
    attackRange: 625,
    hpPerLevel: 96,
    mpPerLevel: 25,
    armorPerLevel: 4,
    magicResistPerLevel: 1.3,
    attackDamagePerLevel: 2.63,
    attackSpeedPerLevel: 1.36,
    hpRegen: 5.5,
    hpRegenPerLevel: 0.55,
    mpRegen: 8,
    mpRegenPerLevel: 0.8,
    crit: 0,
    critPerLevel: 0,
  },
  spells: [
    {
      id: 'AnnieQ',
      name: 'Désintégration',
      description:
        "Annie projette une boule d'énergie magique infligeant des dégâts. Le coût en mana est rendu si la cible est tuée.",
      maxRank: 5,
      cooldownTurns: [2, 2, 2, 2, 2],
      cost: [60, 65, 70, 75, 80],
      range: [625, 625, 625, 625, 625],
      image: 'AnnieQ.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0, apRatio: 0.8 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.8,
          baseDamage: [90, 125, 160, 195, 230],
        },
      ],
    },
    {
      id: 'AnnieW',
      name: 'Incinération',
      description:
        'Annie projette un cône de flammes, infligeant des dégâts magiques à tous les ennemis dans la zone.',
      maxRank: 5,
      cooldownTurns: [2, 2, 2, 2, 2],
      cost: [70, 80, 90, 100, 110],
      range: [600, 600, 600, 600, 600],
      image: 'AnnieW.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 0.85 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.85,
          baseDamage: [80, 125, 170, 215, 260],
        },
      ],
    },
    {
      id: 'AnnieE',
      name: 'Bouclier en fusion',
      description:
        'Octroie à Annie ou à un allié un bonus en vitesse de déplacement et un bouclier.',
      maxRank: 5,
      cooldownTurns: [4, 4, 3, 3, 3],
      cost: [40, 40, 40, 40, 40],
      range: [800, 800, 800, 800, 800],
      image: 'AnnieE.png',
      targeting: TargetingType.Ally,
      scaling: { adRatio: 0, apRatio: 0.4 },
      effects: [
        { type: 'shield', baseValue: [75, 115, 155, 195, 235], apRatio: 0.4 },
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
      id: 'AnnieR',
      name: 'Invocation : Tibbers',
      description:
        'Annie invoque Tibbers, infligeant des dégâts magiques dans la zone. Tibbers attaque et brûle les ennemis proches.',
      maxRank: 3,
      cooldownTurns: [8, 7, 6],
      cost: [100, 100, 100],
      range: [600, 600, 600],
      image: 'AnnieR.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 0.65 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.65,
          baseDamage: [150, 275, 400],
        },
      ],
    },
  ],
  passive: {
    name: 'Pyromanie',
    description:
      'Après avoir utilisé 4 compétences, sa prochaine compétence offensive étourdit la cible pendant 1.75 secondes.',
    image: 'Annie_Passive.png',
    targeting: TargetingType.Passive,
    scaling: { adRatio: 0, apRatio: 0 },
    effects: [{ type: 'cc', ccType: 'stun', ccDuration: 1.75 }],
  },
  iconUrl: riotChampionIconUrl('Annie'),
};
