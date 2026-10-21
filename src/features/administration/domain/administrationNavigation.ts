/** The only persisted administration context is this bounded, allow-listed URL state. */
export const ADMINISTRATION_GROUPS = [
  'overview',
  'players',
  'runs',
  'balance',
  'moderation',
  'monitoring',
] as const;
export type AdministrationGroup = (typeof ADMINISTRATION_GROUPS)[number];
export const ADMINISTRATION_VIEWS = {
  overview: ['dashboard', 'analytics'],
  players: ['list'],
  runs: ['list'],
  balance: ['reports', 'calibration'],
  moderation: ['queue'],
  monitoring: ['logs', 'authority', 'service'],
} as const satisfies Record<AdministrationGroup, readonly string[]>;
export type AdministrationView = (typeof ADMINISTRATION_VIEWS)[AdministrationGroup][number];
export const ADMINISTRATION_CONTEXTS = [
  'players',
  'runFilters',
  'runOptions',
  'analytics',
  'balance',
  'moderation',
  'diagnostics',
] as const;
export type AdministrationContextKey = (typeof ADMINISTRATION_CONTEXTS)[number];
export interface AdministrationLocation {
  group: AdministrationGroup;
  view: AdministrationView;
  player: string | null;
  run: string | null;
  contexts: Partial<Record<AdministrationContextKey, Record<string, string>>>;
}
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const fields = {
  players: [
    'search',
    'registeredFrom',
    'registeredTo',
    'activeFrom',
    'activeTo',
    'verifiedRuns',
    'accountState',
    'pageSize',
  ],
  runFilters: [
    'playerId',
    'from',
    'to',
    'difficulty',
    'mode',
    'result',
    'verification',
    'status',
    'biome',
    'minWaves',
    'maxWaves',
    'championId',
    'engineVersion',
    'gameplayVersion',
    'progressionVersion',
    'ledgerVersion',
    'sortBy',
    'sortOrder',
  ],
  runOptions: ['population', 'pageSize'],
  analytics: [
    'from',
    'to',
    'granularity',
    'engineVersion',
    'gameplayVersion',
    'progressionVersion',
    'commandVersion',
    'contentHash',
    'mode',
    'difficulty',
    'accountAge',
    'metric',
  ],
  balance: [
    'from',
    'to',
    'engineVersion',
    'gameplayVersion',
    'progressionVersion',
    'commandVersion',
    'contentHash',
    'mode',
    'difficulty',
    'championId',
  ],
  moderation: ['status', 'from', 'to', 'dailyRunId'],
  diagnostics: [
    'from',
    'to',
    'level',
    'operation',
    'correlationId',
    'attemptId',
    'engineVersion',
    'gameplayRulesetVersion',
    'status',
    'rejectionCode',
    'granularity',
  ],
} satisfies Record<AdministrationContextKey, string[]>;
const choices: Record<string, readonly string[]> = {
  verifiedRuns: ['all', 'none', 'some'],
  accountState: ['all', 'registered', 'guest'],
  difficulty: ['all', 'easy', 'normal', 'hard'],
  mode: ['all', 'normal', 'daily'],
  result: ['all', 'won', 'lost'],
  verification: ['all', 'verified', 'legacy'],
  sortBy: ['completed_at', 'waves_completed', 'run_level'],
  sortOrder: ['asc', 'desc'],
  population: ['runs', 'attempts'],
  accountAge: ['all', 'new', 'existing'],
  metric: [
    'acquisitions',
    'activePlayers',
    'starts',
    'verifiedFinishes',
    'wins',
    'dailyStarts',
    'dailyVerifiedFinishes',
  ],
  granularity: ['day', 'week', 'hour'],
  level: ['all', 'debug', 'info', 'warn', 'error'],
};
function safeValue(key: string, value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > (key === 'search' ? 80 : 160) ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return false;
  if (choices[key] && !choices[key].includes(value)) return false;
  if (['playerId', 'dailyRunId', 'attemptId', 'correlationId'].includes(key))
    return value === '' || UUID.test(value);
  if (key === 'pageSize') return /^(?:[1-9]\d?|100)$/.test(value);
  if (
    [
      'minWaves',
      'maxWaves',
      'gameplayVersion',
      'progressionVersion',
      'ledgerVersion',
      'commandVersion',
      'gameplayRulesetVersion',
    ].includes(key)
  )
    return value === '' || (/^\d{1,10}$/.test(value) && Number.isSafeInteger(Number(value)));
  if (key === 'status')
    return [
      'all',
      'open',
      'resolved',
      'dismissed',
      'started',
      'finished',
      'verified',
      'rejected',
      'expired',
    ].includes(value);
  if (key === 'operation')
    return ['all', 'select', 'insert', 'update', 'upsert', 'delete', 'auth', 'other'].includes(
      value,
    );
  return true;
}
export function sanitizeAdministrationContext(
  key: AdministrationContextKey,
  input: unknown,
): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result: Record<string, string> = {};
  for (const field of fields[key]) {
    const value: unknown = (input as Record<string, unknown>)[field];
    if (safeValue(field, value)) result[field] = value;
  }
  return result;
}
const legacyTabs: Record<string, [AdministrationGroup, AdministrationView]> = {
  dashboard: ['overview', 'dashboard'],
  analytics: ['overview', 'analytics'],
  players: ['players', 'list'],
  runs: ['runs', 'list'],
  balance: ['balance', 'reports'],
  moderation: ['moderation', 'queue'],
  logs: ['monitoring', 'logs'],
  authority: ['monitoring', 'authority'],
};
export function parseAdministrationLocation(params: URLSearchParams): AdministrationLocation {
  const legacy = legacyTabs[params.get('tab') ?? ''];
  const requested = params.get('group');
  const group = ADMINISTRATION_GROUPS.includes(requested as AdministrationGroup)
    ? (requested as AdministrationGroup)
    : (legacy?.[0] ?? 'overview');
  const views: readonly string[] = ADMINISTRATION_VIEWS[group];
  const requestedView = params.get('view') ?? (legacy?.[0] === group ? legacy[1] : null);
  const view = views.includes(requestedView ?? '')
    ? (requestedView as AdministrationView)
    : (views[0] as AdministrationView);
  const contexts: AdministrationLocation['contexts'] = {};
  for (const key of ADMINISTRATION_CONTEXTS) {
    const raw = params.get(key);
    if (!raw || raw.length > 4096) continue;
    try {
      const value = sanitizeAdministrationContext(key, JSON.parse(raw));
      if (Object.keys(value).length) contexts[key] = value;
    } catch {
      /* Malformed or unsupported context has no effect on requests. */
    }
  }
  const id = (key: string) => {
    const value = params.get(key);
    return value && UUID.test(value) ? value : null;
  };
  return { group, view, player: id('player'), run: id('run'), contexts };
}
export function serializeAdministrationLocation(location: AdministrationLocation): URLSearchParams {
  const params = new URLSearchParams({ group: location.group, view: location.view });
  for (const key of ['player', 'run'] as const)
    if (location[key] && UUID.test(location[key])) params.set(key, location[key]);
  for (const key of ADMINISTRATION_CONTEXTS) {
    const value = sanitizeAdministrationContext(key, location.contexts[key]);
    if (Object.keys(value).length) params.set(key, JSON.stringify(value));
  }
  return params;
}
/** A context is hydrated only after the owning domain validator accepts the entire form. */
export function readAdministrationForm<T extends object>(
  location: AdministrationLocation,
  key: AdministrationContextKey,
  defaults: T,
  validate: (value: T) => unknown,
): T {
  const value = { ...defaults };
  const input = location.contexts[key];
  if (!input) return value;
  for (const field of Object.keys(defaults) as (keyof T & string)[]) {
    if (field in input) (value as Record<string, unknown>)[field] = input[field];
  }
  try {
    validate(value);
    return value;
  } catch {
    return { ...defaults };
  }
}
