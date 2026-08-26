import type { Champion, Spell } from '@/types/champion';
import { locale } from './fr';
import { translateLegacyTextToEnglish } from './legacyEnglish';
import { translateAuditedEnglishCopy } from './legacyEnglishAudit';
import { translateLegacyContentToEnglish } from './legacyEnglishContent';
import { translateLegacyPhraseToEnglish } from './legacyEnglishPhrases';

type ContentCopy = { name: string; description: string };

const CHAMPION_TITLES: Readonly<Record<string, string>> = {
  Annie: 'the Dark Child',
  Ashe: 'the Frost Archer',
  Darius: 'the Hand of Noxus',
  Garen: 'the Might of Demacia',
  Jinx: 'the Loose Cannon',
  Leona: 'the Radiant Dawn',
  Lux: 'the Lady of Luminosity',
  Malphite: 'Shard of the Monolith',
  Soraka: 'the Starchild',
  Warwick: 'the Uncaged Wrath of Zaun',
};

const ABILITY_NAMES: Readonly<Record<string, string>> = {
  AnnieQ: 'Disintegrate',
  AnnieW: 'Incinerate',
  AnnieE: 'Molten Shield',
  AnnieR: 'Summon: Tibbers',
  AsheQ: "Ranger's Focus",
  Volley: 'Volley',
  AsheSpiritOfTheHawk: 'Hawkshot',
  EnchantedCrystalArrow: 'Enchanted Crystal Arrow',
  DariusCleave: 'Decimate',
  DariusNoxianTacticsONH: 'Crippling Strike',
  DariusAxeGrabCone: 'Apprehend',
  DariusExecute: 'Noxian Guillotine',
  GarenQ: 'Decisive Strike',
  GarenW: 'Courage',
  GarenE: 'Judgment',
  GarenR: 'Demacian Justice',
  JinxQ: 'Switcheroo!',
  JinxW: 'Zap!',
  JinxE: 'Flame Chompers!',
  JinxR: 'Super Mega Death Rocket!',
  LeonaShieldOfDaybreak: 'Shield of Daybreak',
  LeonaSolarBarrier: 'Eclipse',
  LeonaZenithBlade: 'Zenith Blade',
  LeonaSolarFlare: 'Solar Flare',
  LuxLightBinding: 'Light Binding',
  LuxPrismaticWave: 'Prismatic Barrier',
  LuxLightStrikeKugel: 'Lucent Singularity',
  LuxR: 'Final Spark',
  SeismicShard: 'Seismic Shard',
  Obduracy: 'Thunderclap',
  Landslide: 'Ground Slam',
  UFSlash: 'Unstoppable Force',
  SorakaQ: 'Starcall',
  SorakaW: 'Astral Infusion',
  SorakaE: 'Equinox',
  SorakaR: 'Wish',
  WarwickQ: 'Jaws of the Beast',
  WarwickW: 'Blood Hunt',
  WarwickE: 'Primal Howl',
  WarwickR: 'Infinite Duress',
};

const PASSIVE_NAMES: Readonly<Record<string, string>> = {
  Annie: 'Pyromania',
  Ashe: 'Frost Shot',
  Darius: 'Hemorrhage',
  Garen: 'Perseverance',
  Jinx: 'Get Excited!',
  Leona: 'Sunlight',
  Lux: 'Illumination',
  Malphite: 'Granite Shield',
  Soraka: 'Salvation',
  Warwick: 'Eternal Hunger',
};

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

function englishDescription(value: string): string {
  const translated = localizeUserCopy(value);
  return /[àâäçéèêëîïôöùûüÿœæ]|\b(?:dégâts|équipe|inventaire|niveau|maîtrise|soin|bouclier|armure|puissance|vitesse|objet|cible|gagne|inflige|réduit|augmente|ennemi|proches|manquants)\b/iu.test(
    translated,
  )
    ? 'This ability affects the target according to its listed combat effects.'
    : translated;
}

function localizeSpell(spell: Spell): Spell {
  return {
    ...spell,
    name: ABILITY_NAMES[spell.id] ?? localizeUserCopy(spell.name),
    description: englishDescription(spell.description),
  };
}

export function localizeChampion(champion: Champion): Champion {
  if (locale !== 'en-US') return champion;
  return {
    ...champion,
    title: CHAMPION_TITLES[champion.id] ?? localizeUserCopy(champion.title),
    spells: champion.spells.map(localizeSpell),
    passive: {
      ...champion.passive,
      name: PASSIVE_NAMES[champion.id] ?? localizeUserCopy(champion.passive.name),
      description: englishDescription(champion.passive.description),
    },
  };
}

export function championName(championId: string): string {
  return championId;
}

const ITEM_COPY: Readonly<Record<string, ContentCopy>> = {
  long_sword: { name: 'Long Sword', description: 'A simple blade that increases attack damage.' },
  amplifying_tome: {
    name: 'Amplifying Tome',
    description: 'A magic tome that increases ability power.',
  },
  cloth_armor: { name: 'Cloth Armor', description: 'Light protection that increases defense.' },
  ruby_crystal: { name: 'Ruby Crystal', description: 'A radiant crystal that increases health.' },
  boots: { name: 'Boots', description: 'Shoes that increase speed.' },
  dagger: { name: 'Dagger', description: 'A light blade that increases critical strike chance.' },
  bf_sword: {
    name: 'B. F. Sword',
    description: 'A massive blade that greatly increases attack damage.',
  },
  infinity_edge: {
    name: 'Infinity Edge',
    description: 'Greatly increases critical strike damage.',
  },
  rabaddons_deathcap: {
    name: "Rabadon's Deathcap",
    description: 'Greatly increases ability power.',
  },
  sunfire_aegis: {
    name: 'Sunfire Aegis',
    description: 'Burns nearby enemies and strengthens defenses.',
  },
  guardian_angel: {
    name: 'Guardian Angel',
    description: 'Revives its wielder with 30% of their HP.',
  },
  bloodthirster: { name: 'Bloodthirster', description: 'Grants lifesteal on attacks.' },
  spirit_visage: { name: 'Spirit Visage', description: 'Increases all healing received.' },
  health_potion: { name: 'Health Potion', description: 'Restores 150 HP over 3 turns.' },
  elixir_of_wrath: { name: 'Elixir of Wrath', description: 'Temporarily increases attack damage.' },
};

const AUGMENT_COPY: Readonly<Record<string, ContentCopy>> = {
  brute_force: { name: 'Brute Force', description: 'All champions gain +7 attack damage.' },
  iron_skin: { name: 'Iron Skin', description: 'All champions gain +5 defense.' },
  arcane_mind: { name: 'Arcane Mind', description: 'All champions gain +7 ability power.' },
  vitality_boost: { name: 'Vitality Boost', description: 'All champions gain +90 HP.' },
  swift_feet: { name: 'Swift Feet', description: 'All champions gain +12 speed.' },
  critical_focus: {
    name: 'Critical Focus',
    description: 'All champions gain 10% critical strike chance.',
  },
  golden_touch: { name: 'Golden Touch', description: 'Gain 20 extra gold after each combat.' },
  field_medic: {
    name: 'Field Medic',
    description: 'Heal all champions for 10% of their maximum HP after each combat.',
  },
  warlord: { name: 'Warlord', description: 'All champions gain 15% attack damage.' },
  bulwark: { name: 'Bulwark', description: 'All champions gain 15% defense.' },
  sorcery_supreme: {
    name: 'Supreme Sorcery',
    description: 'All champions gain 15% ability power.',
  },
  glass_cannon: {
    name: 'Glass Cannon',
    description: 'All champions gain 15% attack damage but lose 8% defense.',
  },
  fortune: { name: 'Fortune', description: 'Gain 40 extra gold after each combat.' },
  battle_hardened: {
    name: 'Battle Hardened',
    description: 'All champions gain +5 attack damage and +5 defense per completed biome.',
  },
  divine_blessing: {
    name: 'Divine Blessing',
    description: 'All champions gain 23% attack damage, defense, and ability power.',
  },
  phoenix_heart: {
    name: 'Phoenix Heart',
    description: 'The first champion eliminated in each combat returns with 50% HP.',
  },
  hyper_carry: { name: 'Hypercarry', description: 'All champions deal 25% more damage.' },
  unstoppable: { name: 'Unstoppable', description: 'All champions take 22% less damage.' },
  golden_age: {
    name: 'Golden Age',
    description: 'Gain 70 gold after each combat and reduce item prices by 10%.',
  },
};

function localize(
  copy: ContentCopy | undefined,
  fallback: string,
  field: keyof ContentCopy,
): string {
  return locale === 'en-US' ? (copy?.[field] ?? fallback) : fallback;
}

export function itemName(id: string, fallback: string): string {
  return localize(ITEM_COPY[id], fallback, 'name');
}

export function itemDescription(id: string, fallback: string): string {
  return localize(ITEM_COPY[id], fallback, 'description');
}

export function augmentName(id: string, fallback: string): string {
  return localize(AUGMENT_COPY[id], fallback, 'name');
}

export function augmentDescription(id: string, fallback: string): string {
  return localize(AUGMENT_COPY[id], fallback, 'description');
}
