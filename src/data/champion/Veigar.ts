import { riotChampionIconUrl } from '@/config/riotAssets';
import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

/** Turn-based kit: one target per spell, one delayed impact, no spatial cage. */
export const veigar: Champion = {
  id: 'Veigar',
  key: '45',
  name: 'Veigar',
  title: 'Seigneur du mal',
  tags: ['Mage'],
  resourceType: 'Mana',
  stats: {
    hp: 650,
    mp: 490,
    moveSpeed: 340,
    armor: 23,
    magicResist: 32,
    attackDamage: 52,
    attackSpeed: 0.625,
    attackRange: 550,
    hpPerLevel: 108,
    mpPerLevel: 26,
    armorPerLevel: 5.2,
    magicResistPerLevel: 1.3,
    attackDamagePerLevel: 2.7,
    attackSpeedPerLevel: 2.24,
    hpRegen: 6.5,
    hpRegenPerLevel: 0.6,
    mpRegen: 8,
    mpRegenPerLevel: 0.8,
    crit: 0,
    critPerLevel: 0,
  },
  spells: [
    {
      id: 'VeigarBalefulStrike',
      name: 'Coup malin',
      description: 'Inflige des dégâts magiques à un ennemi.',
      maxRank: 5,
      cooldownTurns: [2, 2, 2, 2, 2],
      cost: [45, 50, 55, 60, 65],
      range: [950, 950, 950, 950, 950],
      image: 'VeigarBalefulStrike.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0, apRatio: 0.65 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.65,
          baseDamage: [100, 140, 180, 220, 260],
        },
      ],
    },
    {
      id: 'VeigarDarkMatter',
      name: 'Matière noire',
      description:
        'Prépare une frappe qui inflige des dégâts magiques une seule fois, au début du prochain tour de la cible.',
      maxRank: 5,
      cooldownTurns: [3, 3, 3, 3, 3],
      cost: [60, 65, 70, 75, 80],
      range: [900, 900, 900, 900, 900],
      image: 'VeigarDarkMatter.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0, apRatio: 0.85 },
      effects: [
        {
          type: 'delayed_damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.85,
          baseDamage: [90, 130, 170, 210, 250],
          duration: 1,
        },
      ],
    },
    {
      id: 'VeigarEventHorizon',
      name: 'Horizon des événements',
      description:
        'Étourdit un ennemi pendant 1 tour. La cage est représentée par un contrôle ciblé.',
      maxRank: 5,
      cooldownTurns: [4, 4, 4, 4, 4],
      cost: [60, 55, 50, 45, 40],
      range: [700, 700, 700, 700, 700],
      image: 'VeigarEventHorizon.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [{ type: 'cc', ccType: 'stun', ccDuration: 1 }],
    },
    {
      id: 'VeigarR',
      name: 'Explosion primordiale',
      description:
        'Inflige des dégâts magiques à un ennemi, multipliés de ×1 à ×2 selon la proportion de PV manquants.',
      maxRank: 3,
      cooldownTurns: [7, 6, 6],
      cost: [100, 100, 100],
      range: [650, 650, 650],
      image: 'VeigarR.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0, apRatio: 0.7 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.7,
          baseDamage: [160, 260, 360],
          missingHealthScaling: 1,
        },
      ],
    },
  ],
  passive: {
    name: 'Pouvoir maléfique phénoménal',
    description:
      'Gagne 1 point en éliminant un ennemi normal avec une compétence, 3 pour un élite et 10 pour un boss. Chaque point donne +1 puissance, jusqu’à 200. Ces points persistent uniquement pendant le run. Les touches et les assistances ne donnent aucun point.',
    image: 'VeigarEntropy.png',
    targeting: TargetingType.Passive,
    scaling: { adRatio: 0, apRatio: 0 },
    effects: [],
    runProgression: [
      {
        key: 'veigar.phenomenal_power',
        name: 'Pouvoir maléfique phénoménal',
        description:
          '+1 par élimination normale avec une compétence, +3 par élite, +10 par boss ; +1 puissance par point, uniquement pendant ce run.',
        cap: 200,
        statBonuses: { abilityPower: 1 },
        onKill: [
          { targetTier: 'boss', amount: 10 },
          { targetTier: 'elite', amount: 3 },
          { targetTier: 'normal', abilityOnly: true, amount: 1 },
        ],
      },
    ],
  },
  iconUrl: riotChampionIconUrl('Veigar'),
};
