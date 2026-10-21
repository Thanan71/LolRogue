import type {
  DiagnosticsCursor,
  DiagnosticsFiltersBySection,
  DiagnosticsRequest,
  DiagnosticsSection,
} from './adminDiagnosticsTypes';

export const DIAGNOSTICS_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export const DIAGNOSTICS_OPERATIONS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'auth',
  'other',
] as const;
export const DIAGNOSTICS_STATUSES = [
  'started',
  'finished',
  'verified',
  'rejected',
  'expired',
] as const;
export const DIAGNOSTICS_DAY_US = 86_400_000_000n;
export const DIAGNOSTICS_FILTER_KEYS = {
  logs: ['from', 'to', 'level', 'operation', 'correlationId', 'attemptId'],
  authority: ['from', 'to', 'engineVersion', 'gameplayRulesetVersion', 'status', 'rejectionCode'],
  service: ['from', 'to', 'engineVersion', 'gameplayRulesetVersion', 'granularity'],
  correlation: ['from', 'to', 'attemptId'],
} as const;

export function invalidDiagnostics(): never {
  throw new Error('Invalid admin diagnostics contract.');
}
export function diagnosticsRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidDiagnostics();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalidDiagnostics();
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(row, key))
  ) {
    return invalidDiagnostics();
  }
  return row;
}
export function diagnosticsEnum<const T extends string>(value: unknown, values: readonly T[]): T {
  return typeof value === 'string' && values.includes(value as T)
    ? (value as T)
    : invalidDiagnostics();
}
export function diagnosticsCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : invalidDiagnostics();
}
export function diagnosticsNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : invalidDiagnostics();
}
export function diagnosticsBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalidDiagnostics();
}
export function diagnosticsArray(value: unknown, maximum: number): unknown[] {
  return Array.isArray(value) && value.length <= maximum ? value : invalidDiagnostics();
}
export function diagnosticsText(value: unknown, maximum: number): string {
  return typeof value === 'string' &&
    value.length > 0 &&
    Array.from(value).length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : invalidDiagnostics();
}
export function diagnosticsUuid(value: unknown): string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
    ? value
    : invalidDiagnostics();
}
export function diagnosticsVersion(value: unknown): number {
  const result = diagnosticsCount(value);
  return result > 0 && result <= 32767 ? result : invalidDiagnostics();
}
export function diagnosticsEngine(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)
    ? value
    : invalidDiagnostics();
}
export function diagnosticsCode(value: unknown): string {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value)
    ? value
    : invalidDiagnostics();
}
export function diagnosticsDate(value: unknown): string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value))
    return invalidDiagnostics();
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? value
    : invalidDiagnostics();
}
export function diagnosticsTimestampUs(value: unknown): bigint {
  if (typeof value !== 'string') return invalidDiagnostics();
  const parts =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00(?::00)?)$/.exec(value);
  if (!parts || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59)
    return invalidDiagnostics();
  const day = Date.parse(`${diagnosticsDate(parts[1])}T00:00:00Z`);
  return (
    BigInt(day) * 1000n +
    BigInt(Number(parts[2]) * 3600 + Number(parts[3]) * 60 + Number(parts[4])) * 1_000_000n +
    BigInt((parts[5] ?? '').padEnd(6, '0'))
  );
}
export function diagnosticsTimestamp(value: unknown): string {
  diagnosticsTimestampUs(value);
  return value as string;
}
export function diagnosticsNullable<T>(value: unknown, parse: (value: unknown) => T): T | null {
  return value === null ? null : parse(value);
}
export function diagnosticsCursor(value: unknown): DiagnosticsCursor | null {
  if (value === null) return null;
  const row = diagnosticsRecord(value, ['at', 'id']);
  return { at: diagnosticsTimestamp(row.at), id: diagnosticsUuid(row.id) };
}
/** Descending timestamp/UUID order, matching the keyset tuple in PostgreSQL. */
export function diagnosticsOrder(a: DiagnosticsCursor, b: DiagnosticsCursor): number {
  const first = diagnosticsTimestampUs(a.at);
  const second = diagnosticsTimestampUs(b.at);
  return first === second ? (a.id < b.id ? 1 : a.id === b.id ? 0 : -1) : first > second ? -1 : 1;
}
export function diagnosticsIdentity(value: object): string {
  return JSON.stringify(
    Object.entries(value).sort(([first], [second]) => first.localeCompare(second)),
  );
}
export function validateDiagnosticsFilters<S extends DiagnosticsSection>(
  section: S,
  value: unknown,
): DiagnosticsFiltersBySection[S] {
  const row = diagnosticsRecord(value, DIAGNOSTICS_FILTER_KEYS[section]);
  const period = {
    from: diagnosticsDate(row.from),
    to: diagnosticsDate(row.to),
  };
  const days =
    (Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86_400_000;
  if (days < 0 || days > 30 || period.to > '9999-12-30') return invalidDiagnostics();
  let filters: DiagnosticsFiltersBySection[DiagnosticsSection];
  if (section === 'logs') {
    filters = {
      ...period,
      level: diagnosticsNullable(row.level, (value) => diagnosticsEnum(value, DIAGNOSTICS_LEVELS)),
      operation: diagnosticsNullable(row.operation, (value) =>
        diagnosticsEnum(value, DIAGNOSTICS_OPERATIONS),
      ),
      correlationId: diagnosticsNullable(row.correlationId, diagnosticsUuid),
      attemptId: diagnosticsNullable(row.attemptId, diagnosticsUuid),
    };
  } else if (section === 'correlation') {
    filters = { ...period, attemptId: diagnosticsUuid(row.attemptId) };
  } else {
    const versions = {
      ...period,
      engineVersion: diagnosticsNullable(row.engineVersion, diagnosticsEngine),
      gameplayRulesetVersion: diagnosticsNullable(row.gameplayRulesetVersion, diagnosticsVersion),
    };
    filters =
      section === 'authority'
        ? {
            ...versions,
            status: diagnosticsNullable(row.status, (value) =>
              diagnosticsEnum(value, DIAGNOSTICS_STATUSES),
            ),
            rejectionCode: diagnosticsNullable(row.rejectionCode, diagnosticsCode),
          }
        : {
            ...versions,
            granularity: diagnosticsEnum(row.granularity, ['hour', 'day']),
          };
  }
  return filters as DiagnosticsFiltersBySection[S];
}
export function validateDiagnosticsRequest<S extends DiagnosticsSection>(
  request: DiagnosticsRequest<S>,
): Required<DiagnosticsRequest<S>>;
export function validateDiagnosticsRequest(request: unknown): Required<DiagnosticsRequest>;
export function validateDiagnosticsRequest(input: unknown): Required<DiagnosticsRequest> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidDiagnostics();
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalidDiagnostics();
  const request = input as Record<string, unknown>;
  if (
    Object.keys(request).some(
      (key) => !['section', 'filters', 'limit', 'cursor', 'snapshotAt'].includes(key),
    )
  )
    return invalidDiagnostics();
  const section = diagnosticsEnum(request.section, ['logs', 'authority', 'service', 'correlation']);
  const limit = diagnosticsCount(request.limit === undefined ? 25 : request.limit);
  if (limit < 1 || limit > 50) return invalidDiagnostics();
  const cursor = diagnosticsCursor(request.cursor ?? null);
  const snapshotAt = diagnosticsNullable(request.snapshotAt ?? null, diagnosticsTimestamp);
  if (
    cursor &&
    (!snapshotAt || diagnosticsTimestampUs(cursor.at) > diagnosticsTimestampUs(snapshotAt))
  )
    return invalidDiagnostics();
  if (cursor && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at))
    return invalidDiagnostics();
  if (section === 'service' && cursor !== null) return invalidDiagnostics();
  const filters = validateDiagnosticsFilters(section, request.filters);
  if (
    cursor &&
    (diagnosticsTimestampUs(cursor.at) < diagnosticsTimestampUs(`${filters.from}T00:00:00Z`) ||
      diagnosticsTimestampUs(cursor.at) >=
        diagnosticsTimestampUs(`${filters.to}T00:00:00Z`) + DIAGNOSTICS_DAY_US)
  )
    return invalidDiagnostics();
  return {
    section,
    filters,
    limit,
    cursor,
    snapshotAt,
  };
}
export function isDiagnosticsAccessDenied(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42501');
}
