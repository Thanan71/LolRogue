import type { Locale } from './fr';

const messages = {
  'fr-FR': {
    title: 'Arbres et Candies',
    help: 'Achats attestés et arbres figés au départ des runs vérifiées.',
    scope:
      'Les achats suivent la période, la version de progression et le champion. Les filtres de moteur, mode et difficulté concernent uniquement les runs.',
    descriptive:
      'Ces observations ne mesurent pas l’effet causal d’une amélioration. Les arbres, équipes et versions restent séparés.',
    exposure:
      'Les expositions au catalogue ne sont pas collectées. La part affichée est celle des acheteurs, pas un taux de conversion.',
    purchases: 'Achats de nœuds',
    branches: 'Achats par branche',
    builds: 'Arbres au départ des runs',
    commands: 'Commandes d’achat',
    resets: 'Réinitialisations',
    spent: 'Candies dépensées',
    refunded: 'Candies remboursées',
    purchasers: 'Acheteurs uniques',
    share: 'Part des acheteurs',
    count: 'Achats',
    players: 'Joueurs',
    node: 'Nœud',
    branch: 'Branche',
    champion: 'Champion',
    catalogue: 'Catalogue courant',
    catalogueHelp: 'Disponibilité actuelle ; elle ne réécrit pas les arbres historiques des runs.',
    available: 'Disponible',
    disabled: 'Désactivé : effet non pris en charge',
    dependency_blocked: 'Prérequis désactivé',
    gated: 'En attente de validation humaine',
    reconciled: 'Dépenses et remboursements réconciliés avec le registre.',
    incomplete:
      'Couverture du registre incomplète : ces totaux ne prouvent pas toutes les dépenses historiques.',
    coverage: 'Couverture du registre depuis',
    unclassified: 'Commandes non classées',
    insufficient:
      'Échantillon insuffisant : au moins 30 runs et 30 joueurs sont requis pour un taux.',
    purchaseInsufficient: 'Échantillon insuffisant : la part nécessite au moins 30 acheteurs.',
    empty: 'Aucune donnée pour ces filtres.',
    ranks: 'Rangs figés',
    outcome: 'Victoires',
    truncated: 'Liste limitée à 200 arbres. Affine les filtres pour examiner les autres arbres.',
  },
  'en-US': {
    title: 'Trees and Candies',
    help: 'Attested purchases and trees frozen when verified runs began.',
    scope:
      'Purchases follow the date range, progression version and champion. Engine, mode and difficulty filters apply only to runs.',
    descriptive:
      'These observations do not measure the causal effect of an enhancement. Trees, teams and versions remain separate.',
    exposure:
      'Catalogue exposures are not collected. The displayed share is among purchasers, not a conversion rate.',
    purchases: 'Node purchases',
    branches: 'Purchases by branch',
    builds: 'Trees at run start',
    commands: 'Purchase commands',
    resets: 'Resets',
    spent: 'Candies spent',
    refunded: 'Candies refunded',
    purchasers: 'Unique purchasers',
    share: 'Share of purchasers',
    count: 'Purchases',
    players: 'Players',
    node: 'Node',
    branch: 'Branch',
    champion: 'Champion',
    catalogue: 'Current catalogue',
    catalogueHelp: 'Current availability; it does not rewrite historical run trees.',
    available: 'Available',
    disabled: 'Disabled: unsupported effect',
    dependency_blocked: 'Disabled prerequisite',
    gated: 'Awaiting human validation',
    reconciled: 'Spending and refunds reconciled with the ledger.',
    incomplete:
      'Incomplete ledger coverage: these totals cannot establish all historical spending.',
    coverage: 'Ledger coverage started',
    unclassified: 'Unclassified commands',
    insufficient: 'Insufficient sample: a rate requires at least 30 runs and 30 players.',
    purchaseInsufficient: 'Insufficient sample: the share requires at least 30 purchasers.',
    empty: 'No data for these filters.',
    ranks: 'Frozen ranks',
    outcome: 'Wins',
    truncated: 'List limited to 200 trees. Narrow the filters to inspect other trees.',
  },
} as const;

export function getAdminEnhancementTreesCopy(locale: Locale) {
  return messages[locale];
}
