import { locale } from './fr';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(value)} ${value === 1 ? singular : pluralForm}`;
}

const CHAMPION_TAGS: Record<string, string> = {
  Assassin: 'Assassin',
  Fighter: 'Combattant',
  Mage: 'Mage',
  Marksman: 'Tireur',
  Support: 'Support',
  Tank: 'Tank',
};

export function formatChampionTag(tag: string): string {
  return CHAMPION_TAGS[tag] ?? tag;
}
