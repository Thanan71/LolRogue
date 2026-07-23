/**
 * Leona — the Radiant Dawn
 * Role: Tank / Support | Resource: Mana
 *
 * Passive: Sunlight — Spells mark enemies, allies proc for bonus magic damage.
 * Q: Shield of Daybreak — Empowered AA, stuns.
 * W: Eclipse — Shield + AoE magic damage after delay.
 * E: Zenith Blade — Dash to enemy champion, roots.
 * R: Solar Flare — AoE stun center, slow edge.
 */

import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

export const leona: Champion = {
  id: 'Leona',
  key: '89',
  name: 'Leona',
  title: 'Aube radieuse',
  tags: ['Tank', 'Support'],
  resourceType: 'Mana',
  stats: {
    hp: 646,
    mp: 302,
    moveSpeed: 335,
    armor: 43,
    magicResist: 32,
    attackDamage: 60,
    attackSpeed: 0.625,
    attackRange: 125,
    hpPerLevel: 101,
    mpPerLevel: 40,
    armorPerLevel: 4.8,
    magicResistPerLevel: 2.05,
    attackDamagePerLevel: 3,
    attackSpeedPerLevel: 2.9,
    hpRegen: 8.5,
    hpRegenPerLevel: 0.85,
    mpRegen: 6,
    mpRegenPerLevel: 0.8,
    crit: 0,
    critPerLevel: 0,
  },
  spells: [
    {
      id: 'LeonaShieldOfDaybreak',
      name: 'Bouclier de l aube',
      description:
        'Leona utilise son bouclier pour sa prochaine attaque de base, infligeant des dégâts magiques supplémentaires et étourdissant la cible.',
      maxRank: 5,
      cooldown: [5, 5, 5, 5, 5],
      cost: [30, 35, 40, 45, 50],
      range: [125, 125, 125, 125, 125],
      image: 'LeonaShieldOfDaybreak.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0.3, apRatio: 0 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0.3,
          apRatio: 0,
          baseDamage: [10, 35, 60, 85, 110],
        },
        { type: 'cc', ccType: 'stun', ccDuration: 1 },
      ],
    },
    {
      id: 'LeonaSolarBarrier',
      name: 'Éclipse',
      description:
        'Leona lève son bouclier, gagnant armure et résistance magique. Après un délai, elle inflige des dégâts magiques aux ennemis proches.',
      maxRank: 5,
      cooldown: [14, 13, 12, 11, 10],
      cost: [60, 60, 60, 60, 60],
      range: [450, 450, 450, 450, 450],
      image: 'LeonaSolarBarrier.png',
      targeting: TargetingType.Self,
      scaling: { adRatio: 0.4, apRatio: 0.2 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0.4,
          apRatio: 0.2,
          baseDamage: [45, 80, 115, 150, 185],
        },
        { type: 'shield', baseValue: [30, 55, 80, 105, 130], apRatio: 0.2 },
      ],
    },
    {
      id: 'LeonaZenithBlade',
      name: 'Lame du zénith',
      description:
        'Leona projette une image solaire, infligeant des dégâts magiques aux ennemis en ligne. Le dernier champion touché est immobilisé et Leona fonce vers lui.',
      maxRank: 5,
      cooldown: [12, 10.5, 9, 7.5, 6],
      cost: [40, 45, 50, 55, 60],
      range: [875, 875, 875, 875, 875],
      image: 'LeonaZenithBlade.png',
      targeting: TargetingType.Enemy,
      scaling: { adRatio: 0.4, apRatio: 0.4 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0.4,
          apRatio: 0.4,
          baseDamage: [60, 100, 140, 180, 220],
        },
        { type: 'cc', ccType: 'snare', ccDuration: 0.5 },
      ],
    },
    {
      id: 'LeonaSolarFlare',
      name: 'Éruption solaire',
      description:
        'Leona invoque un rayon d énergie solaire. Les ennemis au centre sont étourdis, ceux en bordure ralentis.',
      maxRank: 3,
      cooldown: [90, 75, 60],
      cost: [100, 100, 100],
      range: [1200, 1200, 1200],
      image: 'LeonaSolarFlare.png',
      targeting: TargetingType.Area,
      scaling: { adRatio: 0, apRatio: 0.8 },
      effects: [
        {
          type: 'damage',
          damageType: 'magical',
          adRatio: 0,
          apRatio: 0.8,
          baseDamage: [150, 250, 350],
        },
        { type: 'cc', ccType: 'stun', ccDuration: 1.5 },
        { type: 'cc', ccType: 'slow', slowPercent: 80, ccDuration: 1.5 },
      ],
    },
  ],
  passive: {
    name: 'Rayon de soleil',
    description:
      'Les sorts marquent les ennemis d un Rayon de soleil. Si des champions alliés blessent ces ennemis, ils dissipent le Rayon et infligent des dégâts magiques supplémentaires.',
    image: 'LeonaSunlight.png',
    targeting: TargetingType.Passive,
    scaling: { adRatio: 0, apRatio: 0 },
    effects: [
      {
        type: 'damage',
        damageType: 'magical',
        adRatio: 0,
        apRatio: 0,
        baseDamage: [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25],
      },
    ],
  },
  iconUrl: '/lol/data/img/champions/Leona.png',
};
