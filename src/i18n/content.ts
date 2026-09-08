import type { Champion, Spell } from '@/types/champion';
import { championContent } from './championContent';
import { locale } from './fr';
import { inventoryContent } from './inventoryContent';

const unavailableEnglishPassive = {
  name: 'Passive',
  description: 'English passive details are unavailable.',
} as const;
const unavailableEnglishSpell = {
  name: 'Ability',
  description: 'English ability details are unavailable.',
} as const;

export function localizeSpell(spell: Spell, championId: string): Spell {
  const copy = championContent[locale][championId]?.spells[spell.id];
  if (!copy) return locale === 'fr-FR' ? spell : { ...spell, ...unavailableEnglishSpell };
  return {
    ...spell,
    name: copy.name,
    description: copy.description,
  };
}

export function localizeChampion(champion: Champion): Champion {
  const copy = championContent[locale][champion.id];
  if (!copy) {
    if (locale === 'fr-FR') return champion;
    return {
      ...champion,
      name: champion.id,
      title: champion.id,
      spells: champion.spells.map((spell) => localizeSpell(spell, champion.id)),
      passive: { ...champion.passive, ...unavailableEnglishPassive },
    };
  }
  return {
    ...champion,
    name: copy.name,
    title: copy.title,
    spells: champion.spells.map((spell) => localizeSpell(spell, champion.id)),
    passive: {
      ...champion.passive,
      name: copy.passive.name,
      description: copy.passive.description,
    },
  };
}

export function championName(championId: string): string {
  return championContent[locale][championId]?.name ?? championId;
}

export function itemName(id: string, _fallback: string): string {
  const catalog = inventoryContent[locale];
  return (catalog.items[id] ?? catalog.fallbacks.item).name;
}

export function itemDescription(id: string, _fallback: string): string {
  const catalog = inventoryContent[locale];
  return (catalog.items[id] ?? catalog.fallbacks.item).description;
}

export function itemPassiveName(itemId: string, passiveId: string, _fallback = passiveId): string {
  const catalog = inventoryContent[locale];
  return (catalog.items[itemId]?.passives[passiveId] ?? catalog.fallbacks.passive).name;
}

export function itemPassiveDescription(
  itemId: string,
  passiveId: string,
  _fallback: string,
): string {
  const catalog = inventoryContent[locale];
  return (catalog.items[itemId]?.passives[passiveId] ?? catalog.fallbacks.passive).description;
}

export function augmentName(id: string, _fallback: string): string {
  const catalog = inventoryContent[locale];
  return (catalog.augments[id] ?? catalog.fallbacks.augment).name;
}

export function augmentDescription(id: string, _fallback: string): string {
  const catalog = inventoryContent[locale];
  return (catalog.augments[id] ?? catalog.fallbacks.augment).description;
}

export function runeName(id: string, _fallback = id): string {
  const catalog = inventoryContent[locale];
  return (catalog.runes[id] ?? catalog.fallbacks.rune).name;
}

export function runeDescription(id: string, _fallback: string): string {
  const catalog = inventoryContent[locale];
  return (catalog.runes[id] ?? catalog.fallbacks.rune).description;
}
