import { type Locale, locale } from '@/i18n/fr';

export function formatAdminDate(dateString: string, selectedLocale: Locale = locale): string {
  return new Intl.DateTimeFormat(selectedLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function formatAdminDay(dateString: string, selectedLocale: Locale = locale): string {
  return new Intl.DateTimeFormat(selectedLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(`${dateString}T00:00:00`));
}

export function formatAdminNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
  selectedLocale: Locale = locale,
): string {
  return new Intl.NumberFormat(selectedLocale, options).format(value);
}

export function formatAdminPercent(value: number, selectedLocale: Locale = locale): string {
  return new Intl.NumberFormat(selectedLocale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatAdminSignedNumber(
  value: number,
  digits = 1,
  selectedLocale: Locale = locale,
): string {
  return formatAdminNumber(
    value,
    {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: 'exceptZero',
    },
    selectedLocale,
  );
}

export function formatAdminCount(
  value: number,
  singular: string,
  pluralForm: string,
  selectedLocale: Locale = locale,
): string {
  const form = new Intl.PluralRules(selectedLocale).select(value) === 'one' ? singular : pluralForm;
  return `${formatAdminNumber(value, {}, selectedLocale)} ${form}`;
}
