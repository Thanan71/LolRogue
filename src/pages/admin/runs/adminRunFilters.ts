import type { Json } from '@/types/database';

export type AdminRunPopulation = 'runs' | 'attempts';

export interface AdminRunFilters {
  playerId: string;
  from: string;
  to: string;
  difficulty: 'all' | 'easy' | 'normal' | 'hard';
  mode: 'all' | 'normal' | 'daily';
  result: 'all' | 'won' | 'lost';
  verification: 'all' | 'verified' | 'legacy';
  status: 'all' | 'started' | 'finished' | 'verified' | 'rejected' | 'expired';
  biome: string;
  minWaves: string;
  maxWaves: string;
  championId: string;
  engineVersion: string;
  gameplayVersion: string;
  progressionVersion: string;
  ledgerVersion: string;
  sortBy: 'completed_at' | 'waves_completed' | 'run_level';
  sortOrder: 'asc' | 'desc';
}

export const DEFAULT_ADMIN_RUN_FILTERS: Readonly<AdminRunFilters> = {
  playerId: '',
  from: '',
  to: '',
  difficulty: 'all',
  mode: 'all',
  result: 'all',
  verification: 'all',
  status: 'all',
  biome: '',
  minWaves: '',
  maxWaves: '',
  championId: '',
  engineVersion: '',
  gameplayVersion: '',
  progressionVersion: '',
  ledgerVersion: '',
  sortBy: 'completed_at',
  sortOrder: 'desc',
};

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const NUMERIC_FIELDS = [
  'minWaves',
  'maxWaves',
  'gameplayVersion',
  'progressionVersion',
  'ledgerVersion',
] as const;

/** Explicit UTC dates and typed JSON keep UI strings out of SQL filter syntax. */
export function adminRunRpcFilters(
  filters: AdminRunFilters,
  population: AdminRunPopulation,
): Record<string, Json> {
  const result: Record<string, Json> = {};
  if (filters.playerId && !UUID.test(filters.playerId)) throw new Error('Invalid player ID.');
  for (const [key, value] of Object.entries(filters)) {
    if (value === '' || value === 'all') continue;
    if (
      population === 'attempts' &&
      [
        'result',
        'verification',
        'biome',
        'minWaves',
        'maxWaves',
        'ledgerVersion',
        'sortBy',
        'sortOrder',
      ].includes(key)
    )
      continue;
    if (key === 'status' && population === 'runs') continue;
    result[key] = value;
  }
  for (const field of NUMERIC_FIELDS) {
    if (population === 'attempts' && ['minWaves', 'maxWaves', 'ledgerVersion'].includes(field))
      continue;
    if (filters[field] === '') continue;
    if (!/^\d+$/.test(filters[field])) throw new Error('Invalid numeric filter.');
    const value = Number(filters[field]);
    if (!Number.isSafeInteger(value) || (field.endsWith('Version') && value < 1))
      throw new Error('Invalid numeric filter.');
    result[field] = value;
  }
  if (
    population === 'runs' &&
    filters.minWaves !== '' &&
    filters.maxWaves !== '' &&
    Number(filters.minWaves) > Number(filters.maxWaves)
  )
    throw new Error('Invalid wave bounds.');
  for (const field of ['from', 'to'] as const) {
    if (!filters[field]) continue;
    // datetime-local is deliberately interpreted as UTC, regardless of browser timezone.
    const date = new Date(`${filters[field]}Z`);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid UTC date.');
    result[field] = date.toISOString();
  }
  if (result.from && result.to && String(result.from) >= String(result.to)) {
    throw new Error('Invalid date interval.');
  }
  return result;
}
