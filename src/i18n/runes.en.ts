import { inventoryContent } from './inventoryContent';

const english = inventoryContent['en-US'];

export function runeNameEn(runeId: string, _fallback = runeId): string {
  return (english.runes[runeId] ?? english.fallbacks.rune).name;
}

export function runeDescriptionEn(runeId: string, _fallback: string): string {
  return (english.runes[runeId] ?? english.fallbacks.rune).description;
}
