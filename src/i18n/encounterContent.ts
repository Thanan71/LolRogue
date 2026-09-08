import type { EncounterType, EventOutcomeType } from '@/game/map/types';
import type { Biome } from '@/types/run';

export type EncounterContentLocale = 'fr-FR' | 'en-US';

export interface EncounterPresentationSource {
  readonly type: EncounterType;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly championId?: string | null;
}

export interface EventOutcomePresentationSource {
  readonly type: EventOutcomeType;
  readonly description?: string | null;
}

export interface EncounterPresentation {
  readonly name: string;
  readonly description: string;
  readonly resolution: 'catalog' | 'fallback';
}

export interface EventOutcomePresentation {
  readonly description: string;
  readonly resolution: 'catalog' | 'fallback';
}

type LocalizedText = Readonly<Record<EncounterContentLocale, string>>;

interface LocalizedEncounter {
  readonly name: LocalizedText;
  readonly description: LocalizedText;
}

function localized(english: string, french: string): LocalizedText {
  return {
    'fr-FR': french,
    'en-US': english,
  };
}

function encounterCopy(
  englishName: string,
  englishDescription: string,
  frenchName: string,
  frenchDescription: string,
): LocalizedEncounter {
  return {
    name: localized(englishName, frenchName),
    description: localized(englishDescription, frenchDescription),
  };
}

const BIOME_COPY = {
  top_lane: { english: 'top lane', frenchLocation: 'la voie du haut' },
  jungle: { english: 'jungle', frenchLocation: 'la jungle' },
  mid_lane: { english: 'mid lane', frenchLocation: 'la voie du milieu' },
  bot_lane: { english: 'bot lane', frenchLocation: 'la voie du bas' },
  river: { english: 'river', frenchLocation: 'la rivière' },
  base: { english: 'base', frenchLocation: 'la base' },
} as const satisfies Record<Biome, { readonly english: string; readonly frenchLocation: string }>;

const SHOP_COPY = {
  top_lane: encounterCopy(
    'The Armory',
    'A merchant appears with wares from the top lane.',
    'L’Armurerie',
    'Un marchand apparaît avec des marchandises venues de la voie du haut.',
  ),
  jungle: encounterCopy(
    'Nomad Trader',
    'A merchant appears with wares from the jungle.',
    'Marchand nomade',
    'Un marchand apparaît avec des marchandises venues de la jungle.',
  ),
  mid_lane: encounterCopy(
    'Arcane Emporium',
    'A merchant appears with wares from the mid lane.',
    'Échoppe arcanique',
    'Un marchand apparaît avec des marchandises venues de la voie du milieu.',
  ),
  bot_lane: encounterCopy(
    'Market Stalls',
    'A merchant appears with wares from the bot lane.',
    'Étals du marché',
    'Un marchand apparaît avec des marchandises venues de la voie du bas.',
  ),
  river: encounterCopy(
    'River Merchant',
    'A merchant appears with wares from the river.',
    'Marchand de la rivière',
    'Un marchand apparaît avec des marchandises venues de la rivière.',
  ),
  base: encounterCopy(
    'Black Market',
    'A merchant appears with wares from the base.',
    'Marché noir',
    'Un marchand apparaît avec des marchandises venues de la base.',
  ),
} as const satisfies Record<Biome, LocalizedEncounter>;

const REST_NAME_COPY = [
  localized('Campfire', 'Feu de camp'),
  localized('Meditation Shrine', 'Sanctuaire de méditation'),
  localized('Healing Spring', 'Source de guérison'),
  localized('Safe Haven', 'Havre sûr'),
  localized('Temple of Renewal', 'Temple du renouveau'),
] as const;

const REST_DESCRIPTION_COPY = [
  localized(
    'A sacred place that fully restores your team.',
    'Un lieu sacré qui restaure entièrement votre équipe.',
  ),
  localized(
    'A moment of respite to tend your wounds.',
    'Un moment de répit pour soigner vos blessures.',
  ),
] as const;

const EVENT_COPY = [
  encounterCopy(
    'Mysterious Chest',
    'A glowing chest sits in your path. Do you open it?',
    'Coffre mystérieux',
    'Un coffre lumineux bloque votre chemin. Oserez-vous l’ouvrir ?',
  ),
  encounterCopy(
    'Wandering Spirit',
    'A friendly spirit offers to help your team.',
    'Esprit errant',
    'Un esprit bienveillant propose son aide à votre équipe.',
  ),
  encounterCopy(
    'Runic Altar',
    'An ancient altar pulses with power.',
    'Autel runique',
    'Un autel ancien palpite d’une puissance oubliée.',
  ),
  encounterCopy(
    'Loot Goblin',
    'A small creature scurries past with a bag of gold!',
    'Gobelin au butin',
    'Une petite créature détale devant vous avec un sac rempli d’or !',
  ),
] as const;

interface TreasureNameCopy {
  readonly name: LocalizedText;
  readonly frenchSubject: string;
}

const TREASURE_NAME_COPY = [
  {
    name: localized('Shimmering Chest', 'Coffre scintillant'),
    frenchSubject: 'un coffre scintillant',
  },
  { name: localized('Golden Cache', 'Cache dorée'), frenchSubject: 'une cache dorée' },
  { name: localized('Forgotten Hoard', 'Trésor oublié'), frenchSubject: 'un trésor oublié' },
  { name: localized('Mystic Treasure', 'Trésor mystique'), frenchSubject: 'un trésor mystique' },
  { name: localized('Ancient Stash', 'Ancienne réserve'), frenchSubject: 'une ancienne réserve' },
  { name: localized('Goblin Stash', 'Cache du gobelin'), frenchSubject: 'une cache de gobelin' },
  { name: localized("Dragon's Bounty", 'Butin du dragon'), frenchSubject: 'le butin d’un dragon' },
] as const satisfies readonly TreasureNameCopy[];

const EVENT_OUTCOME_COPY = {
  gold_reward: [
    localized('You find gold inside!', 'Vous découvrez de l’or à l’intérieur.'),
    localized('The spirit drops gold.', 'L’esprit dépose quelques pièces d’or.'),
    localized('You catch the goblin!', 'Vous rattrapez le gobelin !'),
  ],
  gold_cost: [localized('The altar demands an offering.', 'L’autel exige une offrande.')],
  item_reward: [
    localized('An item glows inside!', 'Un objet scintille à l’intérieur.'),
    localized('The goblin drops its bag!', 'Le gobelin abandonne son sac !'),
  ],
  heal: [localized('The spirit heals your team!', 'L’esprit soigne votre équipe.')],
  damage: [localized('A trap! The chest explodes!', 'Un piège ! Le coffre explose.')],
  champion_recruit: [
    localized('A champion appears from the altar!', 'Un champion émerge de l’autel !'),
  ],
  stat_boost: [
    localized('The spirit empowers your team!', 'L’esprit renforce votre équipe.'),
    localized('The altar grants you strength!', 'L’autel vous confère une force nouvelle.'),
  ],
  nothing: [
    localized('The chest is empty...', 'Le coffre est vide…'),
    localized(
      'The goblin escapes too fast...',
      'Le gobelin s’échappe avant que vous ne puissiez l’atteindre…',
    ),
  ],
} as const satisfies Record<EventOutcomeType, readonly LocalizedText[]>;

const ENCOUNTER_FALLBACKS = {
  combat: {
    name: localized('Combat', 'Combat'),
    description: localized(
      'An enemy team blocks your path.',
      'Une équipe ennemie bloque votre chemin.',
    ),
  },
  shop: {
    name: localized('Shop', 'Boutique'),
    description: localized(
      'A merchant offers their wares.',
      'Un marchand propose ses marchandises.',
    ),
  },
  recruit: {
    name: localized('Recruitment', 'Recrutement'),
    description: localized(
      'A champion may join your team.',
      'Un champion pourrait rejoindre votre équipe.',
    ),
  },
  event: {
    name: localized('Mysterious Event', 'Événement mystérieux'),
    description: localized(
      'An unexpected encounter awaits.',
      'Une rencontre inattendue se présente.',
    ),
  },
  rest: {
    name: localized('Rest Stop', 'Halte'),
    description: localized(
      'Your team finds a place to recover.',
      'Votre équipe trouve un lieu où reprendre des forces.',
    ),
  },
  treasure: {
    name: localized('Treasure', 'Trésor'),
    description: localized('A treasure awaits your team.', 'Un trésor attend votre équipe.'),
  },
} as const satisfies Record<EncounterType, LocalizedEncounter>;

const EVENT_OUTCOME_FALLBACKS = {
  gold_reward: localized('You leave with some gold.', 'Vous repartez avec de l’or.'),
  gold_cost: localized('The offering is accepted.', 'L’offrande est acceptée.'),
  item_reward: localized(
    'Your discovery is added to your inventory.',
    'Votre découverte rejoint votre inventaire.',
  ),
  heal: localized(
    'A soothing energy washes over your team.',
    'Une énergie apaisante parcourt votre équipe.',
  ),
  damage: localized('The trap wounds your entire team.', 'Le piège blesse toute votre équipe.'),
  champion_recruit: localized(
    'A new champion joins your party.',
    'Votre groupe accueille un nouveau champion.',
  ),
  stat_boost: localized(
    'Your team leaves this encounter stronger.',
    'Votre équipe ressort renforcée de cette rencontre.',
  ),
  nothing: localized(
    'The calm returns without a trace.',
    'Le calme revient sans laisser de trace.',
  ),
} as const satisfies Record<EventOutcomeType, LocalizedText>;

function findLocalizedText(
  entries: readonly LocalizedText[],
  canonicalText: string | null | undefined,
): LocalizedText | undefined {
  return entries.find((entry) => entry['en-US'] === canonicalText);
}

function findEncounterCopy(
  entries: readonly LocalizedEncounter[],
  source: EncounterPresentationSource,
): LocalizedEncounter | undefined {
  return entries.find(
    (entry) =>
      entry.name['en-US'] === source.name && entry.description['en-US'] === source.description,
  );
}

function resolveCatalogEncounter(
  copy: LocalizedEncounter,
  locale: EncounterContentLocale,
): EncounterPresentation {
  return {
    name: copy.name[locale],
    description: copy.description[locale],
    resolution: 'catalog',
  };
}

function resolveFallbackEncounter(
  type: EncounterType,
  locale: EncounterContentLocale,
): EncounterPresentation {
  const fallback = ENCOUNTER_FALLBACKS[type];
  return {
    name: fallback.name[locale],
    description: fallback.description[locale],
    resolution: 'fallback',
  };
}

function resolveShopPresentation(
  locale: EncounterContentLocale,
  source: EncounterPresentationSource,
): EncounterPresentation | undefined {
  const copy = findEncounterCopy(Object.values(SHOP_COPY), source);
  return copy ? resolveCatalogEncounter(copy, locale) : undefined;
}

function resolveRestPresentation(
  locale: EncounterContentLocale,
  source: EncounterPresentationSource,
): EncounterPresentation | undefined {
  const name = findLocalizedText(REST_NAME_COPY, source.name);
  const description = findLocalizedText(REST_DESCRIPTION_COPY, source.description);
  return name && description ? resolveCatalogEncounter({ name, description }, locale) : undefined;
}

function resolveEventPresentation(
  locale: EncounterContentLocale,
  source: EncounterPresentationSource,
): EncounterPresentation | undefined {
  const copy = findEncounterCopy(EVENT_COPY, source);
  return copy ? resolveCatalogEncounter(copy, locale) : undefined;
}

function resolveRecruitPresentation(
  locale: EncounterContentLocale,
  source: EncounterPresentationSource,
): EncounterPresentation | undefined {
  const championId = source.championId;
  if (
    !championId ||
    championId.trim() !== championId ||
    source.name !== `Wild ${championId}` ||
    source.description !== `${championId} appears and may join your team... for a price.`
  ) {
    return undefined;
  }

  return resolveCatalogEncounter(
    encounterCopy(
      source.name,
      source.description,
      `Champion sauvage : ${championId}`,
      `${championId} apparaît et pourrait rejoindre votre équipe… contre rémunération.`,
    ),
    locale,
  );
}

function resolveTreasurePresentation(
  locale: EncounterContentLocale,
  source: EncounterPresentationSource,
): EncounterPresentation | undefined {
  const treasure = TREASURE_NAME_COPY.find((entry) => entry.name['en-US'] === source.name);
  if (!treasure) return undefined;

  const canonicalDescription = source.description;
  if (!canonicalDescription) return undefined;
  const biome = (Object.keys(BIOME_COPY) as Biome[]).find(
    (biomeId) =>
      canonicalDescription ===
      `A ${treasure.name['en-US'].toLowerCase()} glimmers in the ${BIOME_COPY[biomeId].english}.`,
  );
  if (!biome) return undefined;

  return {
    name: treasure.name[locale],
    description:
      locale === 'en-US'
        ? canonicalDescription
        : `Vous apercevez ${treasure.frenchSubject} dans ${BIOME_COPY[biome].frenchLocation}.`,
    resolution: 'catalog',
  };
}

/**
 * Resolves display copy without mutating or rewriting the canonical encounter payload.
 * Unknown canonical pairs use a locale-specific, type-specific fallback.
 */
export function getEncounterPresentation(
  locale: EncounterContentLocale,
  source: EncounterPresentationSource,
): EncounterPresentation {
  let presentation: EncounterPresentation | undefined;
  switch (source.type) {
    case 'shop':
      presentation = resolveShopPresentation(locale, source);
      break;
    case 'rest':
      presentation = resolveRestPresentation(locale, source);
      break;
    case 'event':
      presentation = resolveEventPresentation(locale, source);
      break;
    case 'recruit':
      presentation = resolveRecruitPresentation(locale, source);
      break;
    case 'treasure':
      presentation = resolveTreasurePresentation(locale, source);
      break;
    case 'combat':
      break;
  }

  return presentation ?? resolveFallbackEncounter(source.type, locale);
}

/** Resolves an event outcome description while preserving the canonical outcome payload. */
export function getEventOutcomePresentation(
  locale: EncounterContentLocale,
  source: EventOutcomePresentationSource,
): EventOutcomePresentation {
  const copy = findLocalizedText(EVENT_OUTCOME_COPY[source.type], source.description);
  if (copy) {
    return { description: copy[locale], resolution: 'catalog' };
  }

  return {
    description: EVENT_OUTCOME_FALLBACKS[source.type][locale],
    resolution: 'fallback',
  };
}

export function getEventOutcomeDescription(
  locale: EncounterContentLocale,
  source: EventOutcomePresentationSource,
): string {
  return getEventOutcomePresentation(locale, source).description;
}
