import type {
  RunProgressionDefinition,
  RunProgressionTrigger,
  RunProgressStat,
} from '@/types/champion';
import { locale } from './fr';

export type RunProgressLocale = 'fr-FR' | 'en-US';

const numberFormatters = {
  'fr-FR': new Intl.NumberFormat('fr-FR'),
  'en-US': new Intl.NumberFormat('en-US'),
};

const copy = {
  'fr-FR': {
    heading: 'Progression du run',
    rules: 'Comment gagner des points',
    lifetime:
      'Conservé entre les combats et les biomes de ce run. Une nouvelle run repart de zéro.',
    cap: 'Limite',
    perPoint: 'par point',
    anyEnemy: 'ennemi',
    tiers: { normal: 'ennemi normal', elite: 'élite', boss: 'boss' },
    stats: {
      abilityPower: 'Puissance',
      attackDamage: 'Attaque',
      armor: 'Armure',
      magicResist: 'Résistance magique',
    },
    shortStats: { abilityPower: 'AP', attackDamage: 'AD', armor: 'ARM', magicResist: 'RM' },
    counters: {
      'veigar.phenomenal_power': {
        name: 'Pouvoir maléfique phénoménal',
        description:
          'Veigar gagne de la puissance en éliminant lui-même ses ennemis. Les dégâts et les assistances ne donnent aucun point.',
      },
    },
    trigger: (hook: 'onDamage' | 'onKill' | 'onCombatEnd', target: string, ability: boolean) =>
      hook === 'onCombatEnd'
        ? 'Fin de combat'
        : hook === 'onDamage'
          ? `Dégâts ${ability ? 'par compétence ' : ''}sur ${target}`
          : `Élimination ${ability ? 'par compétence ' : ''}d’un ${target}`,
  },
  'en-US': {
    heading: 'Run progression',
    rules: 'How to gain points',
    lifetime: 'Kept between battles and biomes in this run. A new run starts at zero.',
    cap: 'Cap',
    perPoint: 'per point',
    anyEnemy: 'enemy',
    tiers: { normal: 'normal enemy', elite: 'elite', boss: 'boss' },
    stats: {
      abilityPower: 'Ability power',
      attackDamage: 'Attack damage',
      armor: 'Armor',
      magicResist: 'Magic resistance',
    },
    shortStats: { abilityPower: 'AP', attackDamage: 'AD', armor: 'ARM', magicResist: 'MR' },
    counters: {
      'veigar.phenomenal_power': {
        name: 'Phenomenal evil power',
        description:
          'Veigar gains ability power by defeating enemies himself. Damage and assists grant no points.',
      },
    },
    trigger: (hook: 'onDamage' | 'onKill' | 'onCombatEnd', target: string, ability: boolean) =>
      hook === 'onCombatEnd'
        ? 'End of battle'
        : hook === 'onDamage'
          ? `${ability ? 'Ability damage' : 'Damage'} to a ${target}`
          : `${ability ? 'Ability kill' : 'Kill'} of a ${target}`,
  },
} as const;

export function getRunProgressContent(language: RunProgressLocale = locale) {
  return copy[language];
}

export function localizeRunProgressDefinition(
  definition: RunProgressionDefinition,
  language: RunProgressLocale = locale,
) {
  const translations = copy[language].counters;
  return translations[definition.key as keyof typeof translations] ?? definition;
}

export function runProgressBonusText(
  definition: RunProgressionDefinition,
  count: number,
  language: RunProgressLocale = locale,
) {
  const content = copy[language];
  return Object.entries(definition.statBonuses ?? {})
    .flatMap(([stat, perPoint]) => {
      const key = stat as RunProgressStat;
      if (
        perPoint === undefined ||
        !Number.isFinite(perPoint) ||
        perPoint < 0 ||
        !content.shortStats[key]
      )
        return [];
      return [`+${numberFormatters[language].format(count * perPoint)} ${content.shortStats[key]}`];
    })
    .join(' · ');
}

export function runProgressRules(
  definition: RunProgressionDefinition,
  language: RunProgressLocale = locale,
) {
  const content = copy[language];
  const number = numberFormatters[language];
  return (['onDamage', 'onKill', 'onCombatEnd'] as const).flatMap((hook) =>
    (definition[hook] ?? []).map((trigger: RunProgressionTrigger) => {
      const target = trigger.targetTier ? content.tiers[trigger.targetTier] : content.anyEnemy;
      return `${content.trigger(hook, target, Boolean(trigger.abilityOnly))} : +${number.format(trigger.amount)}`;
    }),
  );
}

export function runProgressSummary(
  definition: RunProgressionDefinition,
  count: number,
  language: RunProgressLocale = locale,
) {
  const number = numberFormatters[language];
  const bonus = runProgressBonusText(definition, count, language);
  return `${localizeRunProgressDefinition(definition, language).name} : ${number.format(count)}/${number.format(definition.cap)}${bonus ? `, ${bonus}` : ''}`;
}
