import {
  analyticsArray,
  analyticsCount,
  analyticsEnum,
  analyticsRecord,
  analyticsText,
  validateAdminAnalyticsFilters,
} from '../analytics/adminAnalyticsValidation';
import type { BalanceFilters } from './balanceTypes';

export function invalidBalance(): never {
  throw new Error('Invalid admin balance contract.');
}

export function balanceVersion(value: unknown): number {
  const result = analyticsCount(value);
  if (result < 1 || result > 32767) return invalidBalance();
  return result;
}

export function balanceHash(value: unknown): string {
  const result = analyticsText(value, 64);
  if (!/^[0-9a-f]{64}$/.test(result)) return invalidBalance();
  return result;
}

export function balanceId(value: unknown): string {
  const result = analyticsText(value, 100);
  if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(result)) return invalidBalance();
  return result;
}

export function balanceEngine(value: unknown): string {
  const result = analyticsText(value, 64);
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(result)) return invalidBalance();
  return result;
}

export function balanceIds(value: unknown, maximum = 128, distinct = true): string[] {
  const result = analyticsArray(value, maximum).map(balanceId);
  if (distinct && new Set(result).size !== result.length) return invalidBalance();
  return result;
}

export function balanceLiteral<const T extends string>(value: unknown, expected: T): T {
  return analyticsEnum(value, [expected]);
}

export function balanceFinite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return invalidBalance();
  return value;
}

export function validateAdminBalanceFilters(value: unknown): BalanceFilters {
  const row = analyticsRecord(value);
  const { championId, ...analytics } = row;
  const normalized = validateAdminAnalyticsFilters(analytics, 'retention');
  if ('accountAge' in normalized) return invalidBalance();
  const result: BalanceFilters = { ...normalized };
  if (championId !== undefined) result.championId = balanceId(championId);
  return result;
}

export function balanceFilterIdentity(value: BalanceFilters): string {
  return JSON.stringify(
    Object.entries(validateAdminBalanceFilters(value)).sort(([a], [b]) => a.localeCompare(b)),
  );
}
