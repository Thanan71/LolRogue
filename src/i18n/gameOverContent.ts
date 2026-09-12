import { type Locale, locale } from './fr';

export type GameOverContentCatalog = Readonly<{
  outcome: Readonly<{
    victory: string;
    defeat: string;
  }>;
  save: Readonly<{
    rejectedTitle: string;
    pendingTitle: string;
    supportDetails: string;
    diagnosticCopied: string;
    copyDiagnostic: string;
  }>;
  rewards: Readonly<{
    verifiedHint: string;
    localHint: string;
    progressionVersion: (version: number) => string;
    championBreakdown: string;
    candies: (count: number) => string;
  }>;
  summary: Readonly<{
    eyebrow: string;
    title: string;
  }>;
  actions: Readonly<{
    eyebrow: string;
    title: string;
    hint: string;
  }>;
  details: Readonly<{
    title: string;
    description: string;
    metricCount: (count: number) => string;
    individualContribution: string;
    championCount: (count: number) => string;
  }>;
  contribution: Readonly<{
    mvp: string;
    damage: string;
    damageAria: (championName: string) => string;
    damageShare: (ratio: number) => string;
    eliminations: string;
    assists: string;
    damageMetric: string;
    healing: string;
    shielding: string;
  }>;
}>;

function formatCount(value: number, contentLocale: Locale): string {
  return new Intl.NumberFormat(contentLocale).format(value);
}

function formatShare(value: number, contentLocale: Locale): string {
  return new Intl.NumberFormat(contentLocale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

const frFR: GameOverContentCatalog = {
  outcome: {
    victory: 'Partie accomplie',
    defeat: 'Partie terminée',
  },
  save: {
    rejectedTitle: 'Progression refusée',
    pendingTitle: 'Sauvegarde en attente',
    supportDetails: 'Détails techniques pour le support',
    diagnosticCopied: 'Diagnostic copié',
    copyDiagnostic: 'Copier le diagnostic',
  },
  rewards: {
    verifiedHint: 'Ajoutées à ta progression vérifiée.',
    localHint: 'Calculées pour cette partie locale.',
    progressionVersion: (version) => `Progression v${formatCount(version, 'fr-FR')}`,
    championBreakdown: 'Répartition par champion',
    candies: (count) => `${formatCount(count, 'fr-FR')} bonbon${count > 1 ? 's' : ''}`,
  },
  summary: {
    eyebrow: 'Bilan de la partie',
    title: 'Les chiffres à retenir',
  },
  actions: {
    eyebrow: 'Prochaine étape',
    title: 'Prêt à repartir ?',
    hint: 'Relance une partie ou reviens au menu principal.',
  },
  details: {
    title: 'Détails de la partie',
    description: 'Économie, soutien et progression',
    metricCount: (count) => `${formatCount(count, 'fr-FR')} indicateur${count > 1 ? 's' : ''}`,
    individualContribution: 'Contribution individuelle à la partie',
    championCount: (count) => `${formatCount(count, 'fr-FR')} champion${count > 1 ? 's' : ''}`,
  },
  contribution: {
    mvp: 'Meilleure contribution de la partie',
    damage: 'Contribution dégâts',
    damageAria: (championName) => `Contribution aux dégâts de ${championName}`,
    damageShare: (ratio) => `${formatShare(ratio, 'fr-FR')} des dégâts de l’équipe`,
    eliminations: 'Éliminations',
    assists: 'Assistances',
    damageMetric: 'Dégâts',
    healing: 'Soins',
    shielding: 'Boucliers',
  },
};

const enUS: GameOverContentCatalog = {
  outcome: {
    victory: 'Run completed',
    defeat: 'Run ended',
  },
  save: {
    rejectedTitle: 'Progress denied',
    pendingTitle: 'Save pending',
    supportDetails: 'Technical details for support',
    diagnosticCopied: 'Diagnostic copied',
    copyDiagnostic: 'Copy diagnostic',
  },
  rewards: {
    verifiedHint: 'Added to your verified progression.',
    localHint: 'Calculated for this local run.',
    progressionVersion: (version) => `Progression v${formatCount(version, 'en-US')}`,
    championBreakdown: 'Breakdown by champion',
    candies: (count) => `${formatCount(count, 'en-US')} ${count === 1 ? 'candy' : 'candies'}`,
  },
  summary: {
    eyebrow: 'Run summary',
    title: 'Key figures',
  },
  actions: {
    eyebrow: 'Next step',
    title: 'Ready to go again?',
    hint: 'Start another run or return to the main menu.',
  },
  details: {
    title: 'Run details',
    description: 'Economy, support, and progression',
    metricCount: (count) => `${formatCount(count, 'en-US')} metric${count === 1 ? '' : 's'}`,
    individualContribution: 'Individual contribution to the run',
    championCount: (count) => `${formatCount(count, 'en-US')} champion${count === 1 ? '' : 's'}`,
  },
  contribution: {
    mvp: 'Run MVP',
    damage: 'Damage contribution',
    damageAria: (championName) => `${championName}'s damage contribution`,
    damageShare: (ratio) => `${formatShare(ratio, 'en-US')} of team damage`,
    eliminations: 'Eliminations',
    assists: 'Assists',
    damageMetric: 'Damage',
    healing: 'Healing',
    shielding: 'Shields',
  },
};

export const gameOverContent = {
  'fr-FR': frFR,
  'en-US': enUS,
} as const satisfies Record<Locale, GameOverContentCatalog>;

export const gameOverCopy = gameOverContent[locale];
