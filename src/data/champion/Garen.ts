/**
 * Garen — The Might of Demacia
 * Role: Fighter / Tank | Resource: None (Aucune)
 *
 * Passive: Perseverance — Regenerates % max HP when out of combat.
 * Q: Decisive Strike — Empowered attack, silence, MS buff.
 * W: Courage — Shield + armor/MR buff.
 * E: Judgement — AoE physical spin damage.
 * R: Demacian Justice — True damage execute.
 */

import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

export const garen: Champion = {
  id: 'Garen',
  key: '86',
  name: 'Garen',
  title: 'Force de Demacia',
  tags: ['Fighter', 'Tank'],
  resourceType: 'Aucune',
  stats: {
    hp: 690,
    mp: 0,
    moveSpeed: 340,
    armor: 38,
    magicResist: 32,
    attackDamage: 69,
    attackSpeed: 0.625,
    attackRange: 175,
    hpPerLevel: 98,
    mpPerLevel: 0,
    armorPerLevel: 4.2,
    magicResistPerLevel: 1.55,
    attackDamagePerLevel: 4.5,
    attackSpeedPerLevel: 3.65,
    hpRegen: 8,
    hpRegenPerLevel: 0.5,
    mpRegen: 0,
    mpRegenPerLevel: 0,
    crit: 0,
    critPerLevel: 0,
  },
  spells: [
    {
      id: 'GarenQ',
      name: 'Coup décisif',
      description:
        'Garen gagne un bonus en vitesse de déplacement et purge les ralentissements. Sa prochaine attaque inflige des dégâts bonus et réduit la cible au silence.',
      maxRank: 5,
      cooldown: [8, 8, 8, 8, 8],
      cost: [0, 0, 0, 0, 0],
      range: [300, 300, 300, 300, 300],
      image: 'GarenQ.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0.5, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'physical',
          adRatio: 0.5,
          apRatio: 0,
          baseDamage: [30, 60, 90, 120, 150],
        },
        { type: 'cc', ccType: 'silence', ccDuration: 1.5 },
        {
          type: 'buff',
          stat: 'moveSpeed',
          modifierType: 'percent',
          values: [30, 30, 30, 30, 30],
          buffDuration: 3,
        },
      ],
    },
    {
      id: 'GarenW',
      name: 'Courage',
      description:
        'Garen active un bouclier qui absorbe les dégâts et augmente temporairement son armure et résistance magique.',
      maxRank: 5,
      cooldown: [23, 21, 19, 17, 15],
      cost: [0, 0, 0, 0, 0],
      range: [0, 0, 0, 0, 0],
      image: 'GarenW.png',
      targeting: TargetingType.Self,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [
        { type: 'shield', baseValue: [70, 95, 120, 145, 170], apRatio: 0 },
        {
          type: 'buff',
          stat: 'armor',
          modifierType: 'percent',
          values: [30, 30, 30, 30, 30],
          buffDuration: 2.5,
        },
      ],
    },
    {
      id: 'GarenE',
      name: 'Jugement',
      description:
        "Garen donne des coups d'épée tourbillonnants, infligeant des dégâts physiques aux ennemis proches.",
      maxRank: 5,
      cooldown: [9, 9, 9, 9, 9],
      cost: [0, 0, 0, 0, 0],
      range: [325, 325, 325, 325, 325],
      image: 'GarenE.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0.32, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'physical',
          adRatio: 0.32,
          apRatio: 0,
          baseDamage: [4, 8, 12, 16, 20],
        },
      ],
    },
    {
      id: 'GarenR',
      name: 'Justice de Demacia',
      description:
        'Garen invoque la puissance de Demacia pour exécuter un champion ennemi, infligeant des dégâts bruts basés sur les PV manquants.',
      maxRank: 3,
      cooldown: [120, 100, 80],
      cost: [0, 0, 0],
      range: [400, 400, 400],
      image: 'GarenR.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [
        { type: 'damage', damageType: 'true', adRatio: 0, apRatio: 0, baseDamage: [150, 300, 450] },
        { type: 'execute', threshold: 30 },
      ],
    },
  ],
  passive: {
    name: 'Persévérance',
    description:
      "Si Garen n'a pas subi de dégâts ou de compétences ennemies récemment, il régénère un pourcentage de ses PV totaux chaque seconde.",
    image: 'Garen_Passive.png',
    targeting: TargetingType.Passive,
    scaling: { adRatio: 0, apRatio: 0 },
    effects: [
      {
        type: 'heal',
        baseValue: [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10],
        apRatio: 0,
      },
    ],
  },
  iconUrl: '/lol/data/img/champions/Garen.png',
};
