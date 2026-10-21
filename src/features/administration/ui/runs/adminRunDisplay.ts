import { championContent } from '@/i18n/championContent';
import { locale } from '@/i18n/fr';

export function adminRunDate(value: string | null, unavailable: string): string {
  if (value === null || !Number.isFinite(Date.parse(value))) return unavailable;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function adminRunNumber(value: number | string | null, unavailable: string): string {
  if (value === null) return unavailable;
  return new Intl.NumberFormat(locale).format(typeof value === 'string' ? BigInt(value) : value);
}

export function adminRunChampion(id: string): string {
  return championContent[locale][id]?.name ?? id;
}
