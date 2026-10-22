export interface EnhancementSpecializationCopy {
  name: string;
  description: string;
}

export const enhancementSpecializationContent = {
  'fr-FR': {
    branches: {
      garen_durability: {
        name: 'Rempart de Demacia',
        description: 'PV et armure. Exclut la voie d’exécution.',
      },
      garen_execution: {
        name: 'Justice implacable',
        description: 'Attaque et pression sur les cibles blessées. Exclut la voie de durabilité.',
      },
      annie_burst: {
        name: 'Flamme de Tibbers',
        description: 'Puissance et dégâts du R. Exclut la voie utilitaire.',
      },
      annie_control: {
        name: 'Apprentie prévoyante',
        description: 'Hâte, résistance magique et régénération de mana. Exclut la voie de burst.',
      },
      soraka_healing: {
        name: 'Grâce des étoiles',
        description: 'Puissance et soins prodigués. Exclut la voie de protection.',
      },
      soraka_protection: {
        name: 'Gardienne céleste',
        description:
          'PV et protection de toute l’équipe tant que Soraka vit. Exclut la voie de soin.',
      },
      jinx_sustained: {
        name: 'Rythme déchaîné',
        description: 'Attaque et initiative d’attaque. Exclut la voie de finisher.',
      },
      jinx_finisher: {
        name: 'Dernière étincelle',
        description:
          'Critique et pression sur les cibles blessées. Exclut la voie de dégâts soutenus.',
      },
    },
    nodes: {
      garen_durability_1: {
        name: 'Courage durable',
        description:
          '+5 % de PV maximum, additifs aux pourcentages de PV des autres améliorations.',
      },
      garen_durability_2: {
        name: 'Armure de Demacia',
        description: '+6 Armure. Ne confère ni bouclier ni nouvelle action.',
      },
      garen_execution_1: { name: 'Pression décisive', description: '+4 Dégâts d’attaque.' },
      garen_execution_2: {
        name: 'Justice approchante',
        description:
          '+6 % de dégâts contre une cible sous 40 % de ses PV maximum. Le seuil d’exécution du R reste inchangé.',
      },
      annie_burst_1: { name: 'Braise concentrée', description: '+6 Puissance.' },
      annie_burst_2: {
        name: 'Colère de Tibbers',
        description:
          '+6 % de dégâts du R uniquement. Ne change ni les charges ni l’étourdissement de Pyromanie.',
      },
      annie_control_1: {
        name: 'Incantation préparée',
        description: '+4 Hâte d’habileté. Ne change pas la durée de l’étourdissement de Pyromanie.',
      },
      annie_control_2: {
        name: 'Étude protectrice',
        description:
          '+6 Résistance magique et +1 régénération PM par tour, limitée aux PM maximum.',
      },
      soraka_healing_1: {
        name: 'Lumière astrale',
        description: '+4 Puissance. Les règles de ciblage des sorts restent inchangées.',
      },
      soraka_healing_2: {
        name: 'Grâce renouvelée',
        description:
          '+5 % de soins prodigués, additifs aux bonus de soin. Les soins restent limités aux PV manquants.',
      },
      soraka_protection_1: {
        name: 'Présence céleste',
        description:
          '+5 % de PV maximum, additifs aux pourcentages de PV des autres améliorations.',
      },
      soraka_protection_2: {
        name: 'Veille des étoiles',
        description:
          'Toute l’équipe, Soraka comprise, subit 4 % de dégâts en moins tant que Soraka vit. Réduction additive aux autres réductions, plafonnée par le moteur.',
      },
      jinx_sustained_1: { name: 'Munitions préparées', description: '+4 Dégâts d’attaque.' },
      jinx_sustained_2: {
        name: 'Cadence constante',
        description:
          '+4 % d’initiative d’attaque, additifs aux autres améliorations. Ne confère ni reset ni action bonus.',
      },
      jinx_finisher_1: {
        name: 'Visée explosive',
        description: '+3 points de chance de critique, avec les plafonds de critique habituels.',
      },
      jinx_finisher_2: {
        name: 'Dernier feu',
        description:
          '+6 % de dégâts contre une cible sous 40 % de ses PV maximum. Le seuil d’exécution du R reste inchangé ; aucun reset ni action bonus.',
      },
    },
  },
  'en-US': {
    branches: {
      garen_durability: {
        name: 'Demacian Bulwark',
        description: 'Health and armor. Excludes the execution path.',
      },
      garen_execution: {
        name: 'Relentless Justice',
        description:
          'Attack damage and pressure against wounded targets. Excludes the durability path.',
      },
      annie_burst: {
        name: 'Tibbers’ Flame',
        description: 'Ability power and R damage. Excludes the utility path.',
      },
      annie_control: {
        name: 'Prepared Apprentice',
        description: 'Haste, magic resistance and mana regeneration. Excludes the burst path.',
      },
      soraka_healing: {
        name: 'Starlight Grace',
        description: 'Ability power and outgoing healing. Excludes the protection path.',
      },
      soraka_protection: {
        name: 'Celestial Guardian',
        description: 'Health and team protection while Soraka is alive. Excludes the healing path.',
      },
      jinx_sustained: {
        name: 'Unleashed Rhythm',
        description: 'Attack damage and attack initiative. Excludes the finisher path.',
      },
      jinx_finisher: {
        name: 'Final Spark',
        description:
          'Critical chance and pressure against wounded targets. Excludes the sustained damage path.',
      },
    },
    nodes: {
      garen_durability_1: {
        name: 'Lasting Courage',
        description: '+5% maximum health, additive with other enhancement health percentages.',
      },
      garen_durability_2: {
        name: 'Demacian Armor',
        description: '+6 Armor. Grants neither a shield nor an additional action.',
      },
      garen_execution_1: { name: 'Decisive Pressure', description: '+4 Attack damage.' },
      garen_execution_2: {
        name: 'Approaching Justice',
        description:
          '+6% damage against targets below 40% maximum health. Does not change R’s execution threshold.',
      },
      annie_burst_1: { name: 'Focused Ember', description: '+6 Ability power.' },
      annie_burst_2: {
        name: 'Tibbers’ Wrath',
        description: '+6% damage from R only. Does not change Pyromania stacks or its stun.',
      },
      annie_control_1: {
        name: 'Prepared Casting',
        description: '+4 Ability haste. Does not change Pyromania’s stun duration.',
      },
      annie_control_2: {
        name: 'Protective Study',
        description:
          '+6 Magic resistance and +1 mana regeneration per turn, capped at maximum mana.',
      },
      soraka_healing_1: {
        name: 'Astral Light',
        description: '+4 Ability power. Spell targeting rules remain unchanged.',
      },
      soraka_healing_2: {
        name: 'Renewed Grace',
        description:
          '+5% outgoing healing, additive with healing bonuses. Healing remains capped at missing health.',
      },
      soraka_protection_1: {
        name: 'Celestial Presence',
        description: '+5% maximum health, additive with other enhancement health percentages.',
      },
      soraka_protection_2: {
        name: 'Starlight Watch',
        description:
          'The entire team, including Soraka, takes 4% less damage while Soraka is alive. Additive with other reductions and subject to the combat cap.',
      },
      jinx_sustained_1: { name: 'Prepared Ammunition', description: '+4 Attack damage.' },
      jinx_sustained_2: {
        name: 'Steady Cadence',
        description:
          '+4% attack initiative, additive with other enhancements. Grants neither resets nor bonus actions.',
      },
      jinx_finisher_1: {
        name: 'Explosive Aim',
        description:
          '+3 percentage points of critical chance, subject to the usual critical chance caps.',
      },
      jinx_finisher_2: {
        name: 'Last Fire',
        description:
          '+6% damage against targets below 40% maximum health. Does not change R’s execution threshold; no resets or bonus actions.',
      },
    },
  },
} as const;

export type EnhancementSpecializationLocale = keyof typeof enhancementSpecializationContent;

export function getSpecializationNodeContent(
  locale: EnhancementSpecializationLocale,
  id: string,
): EnhancementSpecializationCopy | null {
  const nodes: Readonly<Record<string, EnhancementSpecializationCopy>> =
    enhancementSpecializationContent[locale].nodes;
  return nodes[id] ?? null;
}

export function getSpecializationBranchContent(
  locale: EnhancementSpecializationLocale,
  id: string,
): EnhancementSpecializationCopy | null {
  const branches: Readonly<Record<string, EnhancementSpecializationCopy>> =
    enhancementSpecializationContent[locale].branches;
  return branches[id] ?? null;
}
