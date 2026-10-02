import { runeDescription as localizedRuneDescription, runeName } from './content';

export function runeNameFr(runeId: string, fallback = runeId): string {
  return runeName(runeId, fallback);
}

export function runeDescription(runeId: string, fallback: string): string {
  return localizedRuneDescription(runeId, fallback);
}
