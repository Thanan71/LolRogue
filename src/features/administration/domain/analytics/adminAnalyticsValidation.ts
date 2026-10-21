import type { AnalyticsFilters, AnalyticsPopulation } from './analyticsTypes';

export const ANALYTICS_DAY_MS = 86_400_000;
export const ANALYTICS_DAY_US = 86_400_000_000n;

export function invalidAnalytics(): never {
  throw new Error('Invalid admin analytics contract.');
}

export function analyticsRecord(
  value: unknown,
  allowed?: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidAnalytics();
  const result = value as Record<string, unknown>;
  if (allowed && Object.keys(result).some((key) => !allowed.includes(key)))
    return invalidAnalytics();
  return result;
}

export function analyticsText(value: unknown, maximum = 128): string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return invalidAnalytics();
  return value;
}

export function analyticsCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    return invalidAnalytics();
  return value;
}

export function analyticsBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') return invalidAnalytics();
  return value;
}

export function analyticsEnum<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) return invalidAnalytics();
  return value as T[number];
}

export function analyticsArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return invalidAnalytics();
  return value;
}

/** Validate the calendar itself; Date.parse alone accepts rolled-over dates. */
export function analyticsDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-'))
    return invalidAnalytics();
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value)
    return invalidAnalytics();
  return value;
}

export function analyticsDateMs(date: string): number {
  return Date.parse(`${analyticsDate(date)}T00:00:00Z`);
}

export function analyticsDateAtMs(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** Preserve PostgreSQL microseconds, including a coverage marker just after midnight. */
export function analyticsTimestampUs(value: unknown): bigint {
  const text = analyticsText(value, 40);
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(
    text,
  );
  if (!parts || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59)
    return invalidAnalytics();
  const seconds = Number(parts[2]) * 3600 + Number(parts[3]) * 60 + Number(parts[4]);
  return (
    BigInt(analyticsDateMs(parts[1])) * 1000n +
    BigInt(seconds) * 1_000_000n +
    BigInt((parts[5] ?? '').padEnd(6, '0'))
  );
}

export function analyticsTimestamp(value: unknown): string {
  analyticsTimestampUs(value);
  return value as string;
}

const FILTER_KEYS = [
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
] as const;

export function validateAdminAnalyticsFilters(
  value: unknown,
  population: AnalyticsPopulation = 'series',
): AnalyticsFilters {
  const row = analyticsRecord(value, FILTER_KEYS);
  const result: AnalyticsFilters = {
    from: analyticsDate(row.from),
    to: analyticsDate(row.to),
  };
  const days = (analyticsDateMs(result.to) - analyticsDateMs(result.from)) / ANALYTICS_DAY_MS + 1;
  if (days < 1 || days > 366) return invalidAnalytics();
  if (row.granularity !== undefined) {
    if (population !== 'series') return invalidAnalytics();
    result.granularity = analyticsEnum(row.granularity, ['day', 'week']);
  }
  if (row.engineVersion !== undefined) {
    result.engineVersion = analyticsText(row.engineVersion, 64);
    if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(result.engineVersion)) return invalidAnalytics();
  }
  if (row.contentHash !== undefined) {
    result.contentHash = analyticsText(row.contentHash, 64);
    if (!/^[0-9a-f]{64}$/.test(result.contentHash)) return invalidAnalytics();
  }
  for (const key of ['gameplayVersion', 'progressionVersion', 'commandVersion'] as const) {
    if (row[key] === undefined) continue;
    const version = analyticsCount(row[key]);
    if (version < 1 || version > 32767) return invalidAnalytics();
    result[key] = version;
  }
  if (row.mode !== undefined) result.mode = analyticsEnum(row.mode, ['all', 'normal', 'daily']);
  if (row.difficulty !== undefined)
    result.difficulty = analyticsEnum(row.difficulty, ['all', 'easy', 'normal', 'hard']);
  if (row.accountAge !== undefined)
    result.accountAge = analyticsEnum(row.accountAge, ['all', 'new', 'existing']);
  return result;
}

export function analyticsFilterIdentity(
  filters: AnalyticsFilters,
  population: AnalyticsPopulation,
): string {
  const normalized = validateAdminAnalyticsFilters(filters, population);
  return JSON.stringify(
    {
      ...normalized,
      mode: normalized.mode ?? 'all',
      difficulty: normalized.difficulty ?? 'all',
      accountAge: normalized.accountAge ?? 'all',
      ...(population === 'series' ? { granularity: normalized.granularity ?? 'day' } : {}),
    },
    Object.keys({
      ...normalized,
      mode: '',
      difficulty: '',
      accountAge: '',
      ...(population === 'series' ? { granularity: '' } : {}),
    }).sort(),
  );
}
