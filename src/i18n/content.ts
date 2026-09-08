import type { Champion, Spell } from '@/types/champion';
import { championContent } from './championContent';
import { locale } from './fr';
import { inventoryContent } from './inventoryContent';
import { translateLegacyTextToEnglish } from './legacyEnglish';
import { translateAuditedEnglishCopy } from './legacyEnglishAudit';
import { translateLegacyContentToEnglish } from './legacyEnglishContent';
import { translateLegacyPhraseToEnglish } from './legacyEnglishPhrases';

const DIRECT_ENGLISH_COPY: Readonly<Record<string, string>> = {
  Équiper: 'Equip',
  Déséquiper: 'Unequip',
  "Pénétration d'armure": 'Armor penetration',
};

const FRENCH_COPY_REPLACEMENTS: readonly [RegExp, string][] = [
  [/(?:Pénétration|pénétration) d'(?:armure|armor)/gu, 'armor penetration'],
  [/\baugmentés?\b/giu, 'increased'],
  [/\baprès\b/giu, 'after'],
  [/avoir infligé/giu, 'dealing'],
  [/infligé/giu, 'dealt'],
  [/\bfois\b/giu, 'times'],
  [/\btours\b/giu, 'turns'],
  [/\bATQ\b/gu, 'ATK'],
  [/\b(?:gagne|gagnent)\b/giu, 'gains'],
  [/\b(?:inflige|infligent)\b/giu, 'deals'],
  [/\b(?:réduit|réduisent)\b/giu, 'reduces'],
  [/\b(?:absorbe|absorbent)\b/giu, 'absorbs'],
  [/\b(?:augmente|augmentent)\b/giu, 'increases'],
  [/\b(?:active|activent)\b/giu, 'activates'],
  [/\b(?:donne|donnent)\b/giu, 'deals'],
  [/\b(?:purge)\b/giu, 'cleanses'],
  [/\b(?:et)\b/giu, 'and'],
  [/\b(?:son|sa|ses)\b/giu, 'their'],
  [/\b(?:une|un)\b/giu, 'a'],
  [/\b(?:des|les)\b/giu, 'the'],
  [/\b(?:aux)\b/giu, 'to'],
  [/\b(?:proches)\b/giu, 'nearby'],
  [/\b(?:ennemis|ennemi)\b/giu, 'enemies'],
  [/\b(?:manquants)\b/giu, 'missing'],
  [/\b(?:prochaine|prochain)\b/giu, 'next'],
  [/\b(?:attaque|attaques)\b/giu, 'attack'],
  [/\b(?:silence)\b/giu, 'silence'],
  [/\b(?:bouclier|boucliers)\b/giu, 'shield'],
  [/\b(?:résistance)\b/giu, 'resistance'],
  [/\b(?:coups)\b/giu, 'strikes'],
  [/\b(?:épée)\b/giu, 'sword'],
  [/\b(?:tourbillonnants)\b/giu, 'spinning'],
  [/\b(?:physiques)\b/giu, 'physical'],
  [/\b(?:invoque|invoquent)\b/giu, 'summons'],
  [/\b(?:exécuter)\b/giu, 'execute'],
  [/\b(?:bruts)\b/giu, 'true'],
  [/\b(?:basés)\b/giu, 'based'],
  [/\b(?:sur)\b/giu, 'on'],
  [/\b(?:en dessous)\b/giu, 'below'],
  [/\b(?:temporairement)\b/giu, 'temporarily'],
  [/\b(?:magique|magiques)\b/giu, 'magic'],
  [/\b(?:soigner|soigne|soins)\b/giu, 'heal'],
  [/\b(?:cible|cibles)\b/giu, 'target'],
  [/\b(?:ralentissements|ralentissement)\b/giu, 'slows'],
  [/\b(?:durée)\b/giu, 'duration'],
  [/\bd'épée\b/giu, 'sword'],
  [/\binfligeant\b/giu, 'dealing'],
  [/\b(?:pour)\b/giu, 'to'],
  [/\b(?:de|du)\b/giu, 'of'],
  [/\b(?:la|le|les)\b/giu, 'the'],
  [/\b(?:qui)\b/giu, 'that'],
  [/\b(?:avec)\b/giu, 'with'],
  [/\b(?:dans)\b/giu, 'in'],
  [/\b(?:au|aux)\b/giu, 'to the'],
  [/\b(?:tire|tirent)\b/giu, 'fires'],
  [/\b(?:lance|lancent)\b/giu, 'casts'],
  [/\b(?:révélant|révèle)\b/giu, 'revealing'],
  [/\b(?:court)\b/giu, 'runs'],
  [/\b(?:devient)\b/giu, 'becomes'],
  [/\b(?:pendant)\b/giu, 'for'],
  [/\b(?:tous|toute)\b/giu, 'all'],
  [/\b(?:déplacement)\b/giu, 'movement'],
  [/\b(?:subi|subies|subis)\b/giu, 'taken'],
  [/\b(?:compétence|compétences)\b/giu, 'abilities'],
  [/\b(?:régénère|régénération)\b/giu, 'regenerates'],
  [/\b(?:pourcentage)\b/giu, 'percentage'],
  [/\b(?:totaux|totales)\b/giu, 'total'],
  [/\b(?:chaque)\b/giu, 'each'],
  [/\b(?:seconde|secondes)\b/giu, 'second'],
  [/\b(?:récemment)\b/giu, 'recently'],
  [/\b(?:projette|projeter)\b/giu, 'throws'],
  [/\b(?:boule)\b/giu, 'orb'],
  [/\b(?:énergie)\b/giu, 'energy'],
  [/\b(?:coût)\b/giu, 'cost'],
  [/\b(?:rendu|rendue)\b/giu, 'refunded'],
  [/\b(?:tuée|tué|éliminée|éliminé)\b/giu, 'killed'],
  [/\b(?:cône)\b/giu, 'cone'],
  [/\b(?:flammes)\b/giu, 'flames'],
  [/\b(?:octroie|octroyé)\b/giu, 'grants'],
  [/\b(?:allié|alliée|alliés|alliées)\b/giu, 'ally'],
  [/\b(?:brûle|brûlent)\b/giu, 'burns'],
  [/\b(?:à)\b/giu, 'to'],
  [/\b(?:est|sont)\b/giu, 'is'],
  [/\b(?:si)\b/giu, 'if'],
  [/\b(?:en)\b/giu, 'in'],
  [/à/gu, 'to'],
  [/énergie/giu, 'energy'],
  [/allié/giu, 'ally'],
  [/brûle/giu, 'burns'],
  [/d'énergie/giu, 'of energy'],
  [/brûthe/giu, 'burns'],
  [/\bou\b/giu, 'or'],
  [/avoir utilisé/giu, 'using'],
  [/étourdit/giu, 'stuns'],
];

export function localizeUserCopy(value: string): string {
  if (locale !== 'en-US') return value;
  if (DIRECT_ENGLISH_COPY[value]) return DIRECT_ENGLISH_COPY[value];
  let translated = translateLegacyTextToEnglish(
    translateLegacyContentToEnglish(
      translateLegacyPhraseToEnglish(translateAuditedEnglishCopy(value)),
    ),
  );
  for (const [pattern, replacement] of FRENCH_COPY_REPLACEMENTS)
    translated = translated.replace(pattern, replacement);
  return translated;
}

export function localizeSpell(spell: Spell, championId: string): Spell {
  const copy = championContent[locale][championId]?.spells[spell.id];
  if (!copy) return spell;
  return {
    ...spell,
    name: copy.name,
    description: copy.description,
  };
}

export function localizeChampion(champion: Champion): Champion {
  const copy = championContent[locale][champion.id];
  if (!copy) return champion;
  return {
    ...champion,
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
  return championId;
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
