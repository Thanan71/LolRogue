import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';

const integerFormatter = new Intl.NumberFormat(locale);
const percentFormatter = new Intl.NumberFormat(locale, {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dayFormatter = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const instantFormatter = new Intl.DateTimeFormat(locale, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export function analyticsInteger(value: number | null): string {
  return value === null
    ? getAdminAnalyticsCopy(locale).unavailable
    : integerFormatter.format(value);
}

export function analyticsPercent(value: number): string {
  return percentFormatter.format(value);
}

export function analyticsDay(value: string): string {
  return dayFormatter.format(new Date(value));
}

export function analyticsInstant(value: string): string {
  return `${instantFormatter.format(new Date(value))} UTC`;
}

export function analyticsPeriod(start: string, endExclusive: string): string {
  const from = dayFormatter.format(new Date(start));
  const to = dayFormatter.format(new Date(Date.parse(endExclusive) - 1));
  return from === to ? from : `${from} – ${to}`;
}
