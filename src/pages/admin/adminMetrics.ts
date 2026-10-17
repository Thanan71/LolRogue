import { locale as currentLocale } from '@/i18n/fr';

export const ADMIN_METRIC_KEYS = [
  'total_players',
  'active_today',
  'total_runs',
  'total_daily_runs',
  'total_wins',
  'total_candies_balance',
  'total_candies_earned',
  'total_candies_spent',
  'total_candies_refunded',
  'candies_earned_since_ledger',
  'candies_spent_since_ledger',
  'candies_refunded_since_ledger',
  'candies_history_incomplete_accounts',
  'candies_unreconciled_accounts',
  'candies_ledger_started_at',
] as const;
export type AdminMetricKey = (typeof ADMIN_METRIC_KEYS)[number];
export type AdminMetricUnit =
  | 'accounts'
  | 'runs'
  | 'daily_results'
  | 'wins'
  | 'candies'
  | 'timestamp';
type Locale = 'fr-FR' | 'en-US';
type MetricCopy = readonly [label: string, formula: string];

/** Older views mislabeled the current balance as lifetime earnings. Fail closed across rollout. */
export function getAdminMetricValue(key: AdminMetricKey, stats: Record<string, string | null>) {
  const lifetime =
    key === 'total_candies_earned' ||
    key === 'total_candies_spent' ||
    key === 'total_candies_refunded';
  if (lifetime || key.endsWith('_since_ledger')) {
    const startedAt = stats.candies_ledger_started_at;
    if (
      !startedAt ||
      !/^\d{4}-\d{2}-\d{2}T/.test(startedAt) ||
      !Number.isFinite(Date.parse(startedAt))
    )
      return null;
    if (
      lifetime &&
      (!/^0+$/.test(stats.candies_history_incomplete_accounts?.trim() ?? '') ||
        !/^0+$/.test(stats.candies_unreconciled_accounts?.trim() ?? ''))
    )
      return null;
  }
  return stats[key];
}

const descriptions: Record<Locale, Record<AdminMetricKey, MetricCopy>> = {
  'fr-FR': {
    total_players: ['Nombre de comptes', 'Nombre de lignes de players.'],
    active_today: [
      'Connexions enregistrées aujourd’hui (UTC)',
      'Nombre de comptes distincts avec last_login_at dans la journée UTC en cours. Ce n’est pas le nombre d’actions de jeu.',
    ],
    total_runs: ['Parties sauvegardées', 'Nombre de lignes de runs, tous statuts de vérification.'],
    total_daily_runs: [
      'Résultats Daily sauvegardés',
      'Nombre de lignes de daily_runs, y compris les résultats invalidés.',
    ],
    total_wins: [
      'Victoires des comptes',
      'Somme du compteur serveur players.total_wins ; pas un comptage des lignes affichées.',
    ],
    total_candies_balance: [
      'Candies en circulation',
      'Somme des soldes players.total_candies. Un solde n’est pas un gain historique.',
    ],
    total_candies_earned: [
      'Candies gagnés à vie',
      'Somme des gains métier historiques ; indisponible si au moins un compte a un historique incomplet ou non réconcilié.',
    ],
    total_candies_spent: [
      'Candies dépensés à vie',
      'Somme des dépenses métier historiques ; indisponible si au moins un compte a un historique incomplet ou non réconcilié.',
    ],
    total_candies_refunded: [
      'Candies remboursés à vie',
      'Somme des remboursements métier historiques ; indisponible si au moins un compte a un historique incomplet ou non réconcilié.',
    ],
    candies_earned_since_ledger: [
      'Candies gagnés depuis le ledger',
      'Somme des événements earned métier ; soldes d’ouverture et ajustements exclus.',
    ],
    candies_spent_since_ledger: [
      'Candies dépensés depuis le ledger',
      '-SUM(amount) des événements kind=spent ; soldes d’ouverture et ajustements exclus.',
    ],
    candies_refunded_since_ledger: [
      'Candies remboursés depuis le ledger',
      'Somme des événements refunded métier ; soldes d’ouverture et ajustements exclus.',
    ],
    candies_history_incomplete_accounts: [
      'Comptes à historique Candies incomplet',
      'Nombre de comptes dont les gains, dépenses et remboursements antérieurs au ledger ne sont pas connus.',
    ],
    candies_unreconciled_accounts: [
      'Comptes Candies non réconciliés',
      'Nombre de comptes dont le solde du ledger diffère du solde de players.',
    ],
    candies_ledger_started_at: [
      'Début du ledger Candies (UTC)',
      'Instant de démarrage du ledger défini par la migration ; les soldes d’ouverture ne sont pas des gains.',
    ],
  },
  'en-US': {
    total_players: ['Accounts', 'Number of players rows.'],
    active_today: [
      'Recorded logins today (UTC)',
      'Distinct accounts with last_login_at in the current UTC day. This does not count gameplay actions.',
    ],
    total_runs: ['Saved runs', 'Number of runs rows, across all verification statuses.'],
    total_daily_runs: [
      'Saved Daily results',
      'Number of daily_runs rows, including invalidated results.',
    ],
    total_wins: [
      'Account victories',
      'Sum of the server-owned players.total_wins counter, not a count of displayed rows.',
    ],
    total_candies_balance: [
      'Candies in circulation',
      'Sum of players.total_candies balances. A balance is not lifetime earnings.',
    ],
    total_candies_earned: [
      'Lifetime Candies earned',
      'Sum of historical business earnings; unavailable if any account has incomplete or unreconciled history.',
    ],
    total_candies_spent: [
      'Lifetime Candies spent',
      'Sum of historical business spending; unavailable if any account has incomplete or unreconciled history.',
    ],
    total_candies_refunded: [
      'Lifetime Candies refunded',
      'Sum of historical business refunds; unavailable if any account has incomplete or unreconciled history.',
    ],
    candies_earned_since_ledger: [
      'Candies earned since ledger start',
      'Sum of earned business events, excluding opening balances and adjustments.',
    ],
    candies_spent_since_ledger: [
      'Candies spent since ledger start',
      '-SUM(amount) for kind=spent business events, excluding opening balances and adjustments.',
    ],
    candies_refunded_since_ledger: [
      'Candies refunded since ledger start',
      'Sum of refunded business events, excluding opening balances and adjustments.',
    ],
    candies_history_incomplete_accounts: [
      'Accounts with incomplete Candies history',
      'Accounts whose earnings, spending and refunds before ledger start are unknown.',
    ],
    candies_unreconciled_accounts: [
      'Unreconciled Candies accounts',
      'Accounts whose ledger balance differs from their players balance.',
    ],
    candies_ledger_started_at: [
      'Candies ledger start (UTC)',
      'Ledger start recorded by the migration; opening balances are not earnings.',
    ],
  },
};

export function getAdminMetricDefinition(key: AdminMetricKey, locale: Locale = currentLocale) {
  const english = locale === 'en-US';
  const [label, formula] = descriptions[locale][key];
  const ledger =
    key.startsWith('candies_') ||
    key === 'total_candies_spent' ||
    key === 'total_candies_refunded' ||
    key === 'total_candies_earned';
  const lifetime = [
    'total_candies_earned',
    'total_candies_spent',
    'total_candies_refunded',
  ].includes(key);
  const unit: AdminMetricUnit =
    key === 'candies_ledger_started_at'
      ? 'timestamp'
      : key.includes('accounts') || key === 'total_players' || key === 'active_today'
        ? 'accounts'
        : key.includes('candies')
          ? 'candies'
          : key === 'total_daily_runs'
            ? 'daily_results'
            : key === 'total_wins'
              ? 'wins'
              : 'runs';
  const source =
    key === 'total_runs'
      ? 'public.runs'
      : key === 'total_daily_runs'
        ? 'public.daily_runs'
        : key === 'candies_ledger_started_at'
          ? 'public.candy_ledger_settings.started_at'
          : ledger
            ? 'public.candy_accounts + public.candy_transactions (kind, amount)'
            : 'public.players';
  const period =
    key === 'active_today'
      ? english
        ? '[00:00 UTC, next 00:00 UTC)'
        : '[00:00 UTC, 00:00 UTC suivant)'
      : key.endsWith('_since_ledger')
        ? english
          ? 'Since candies_ledger_started_at (UTC)'
          : 'Depuis candies_ledger_started_at (UTC)'
        : lifetime
          ? english
            ? 'Lifetime, only with complete reconciled history'
            : 'À vie, uniquement avec historique complet et réconcilié'
          : english
            ? 'Current persisted data; timestamps in UTC'
            : 'Données persistées actuelles ; dates en UTC';
  return {
    key,
    label,
    formula,
    unit,
    unitLabel: english
      ? `Unit: ${unit === 'timestamp' ? 'UTC timestamp' : unit.replace('_', ' ')}`
      : `Unité : ${unit === 'timestamp' ? 'horodatage UTC' : unit === 'accounts' ? 'comptes' : unit === 'runs' ? 'parties sauvegardées' : unit === 'daily_results' ? 'résultats Daily' : unit === 'wins' ? 'victoires' : 'Candies'}`,
    source: `public.admin_stats.${key} ← ${source}`,
    period,
    timezone: 'UTC',
    population: english
      ? 'Currently persisted accounts and their stored data; administrators and test accounts included, device-only guests excluded. Erasure can reduce the totals. Candies are separate from mastery and Shards.'
      : 'Comptes persistés encore présents et leurs données ; administrateurs et comptes de test inclus, invités locaux exclus. Un effacement peut réduire les totaux. Les Candies sont distincts de la maîtrise et des Éclats.',
    verification:
      key === 'total_runs' || key === 'total_daily_runs' || key === 'total_wins'
        ? english
          ? 'No verified filter; saved runs, Daily results and account counters are distinct populations.'
          : 'Aucun filtre verified ; parties sauvegardées, résultats Daily et compteurs de comptes sont des populations distinctes.'
        : english
          ? 'Server-owned source; no browser aggregation or client reward accepted as proof.'
          : 'Source serveur ; aucune agrégation navigateur ni récompense client admise comme preuve.',
    aggregation: english
      ? 'Server SQL aggregate across the complete authorized population.'
      : 'Agrégat SQL serveur sur toute la population autorisée.',
  };
}

export function formatAdminMetric(
  value: string | number | null | undefined,
  unit: AdminMetricUnit,
  unavailable: string,
  locale: Locale = currentLocale,
): string {
  if (value === null || value === undefined || String(value).trim() === '') return unavailable;
  if (unit === 'timestamp') {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? unavailable
      : `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)} UTC`;
  }
  const integer = String(value).trim();
  if (!/^\d+$/.test(integer) || (typeof value === 'number' && !Number.isSafeInteger(value)))
    return unavailable;
  return new Intl.NumberFormat(locale).format(BigInt(integer));
}
