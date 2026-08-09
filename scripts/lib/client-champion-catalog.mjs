const SUPPORTED_EFFECT_TYPES = new Set([
  'damage',
  'heal',
  'shield',
  'execute',
  'cc',
  'buff',
  'debuff',
  'dot',
  'hot',
  'revive',
]);

function rankValue(values) {
  if (!values?.length) return undefined;
  return values[0] ?? values.at(-1);
}

function isEffectConfigured(effect) {
  if (!SUPPORTED_EFFECT_TYPES.has(effect.type)) return false;
  switch (effect.type) {
    case 'damage':
      return (
        Number.isFinite(rankValue(effect.baseDamage)) ||
        (effect.adRatio ?? 0) !== 0 ||
        (effect.apRatio ?? 0) !== 0
      );
    case 'dot':
      return (
        (effect.duration ?? 0) > 0 &&
        (Number.isFinite(rankValue(effect.baseDamage)) ||
          (effect.adRatio ?? 0) !== 0 ||
          (effect.apRatio ?? 0) !== 0)
      );
    case 'heal':
    case 'shield':
      return Number.isFinite(rankValue(effect.baseValue)) || (effect.apRatio ?? 0) !== 0;
    case 'hot':
      return (
        (effect.duration ?? 0) > 0 &&
        (Number.isFinite(rankValue(effect.baseValue)) || (effect.apRatio ?? 0) !== 0)
      );
    case 'cc':
      return typeof effect.ccType === 'string' && effect.ccType.length > 0;
    case 'buff':
    case 'debuff':
      return (
        typeof effect.stat === 'string' &&
        Number.isFinite(rankValue(effect.values)) &&
        rankValue(effect.values) !== 0
      );
    case 'execute':
      return Number.isFinite(effect.threshold) && (effect.threshold ?? 0) > 0;
    case 'revive':
      return Number.isFinite(effect.revivePercent) && (effect.revivePercent ?? 0) > 0;
    default:
      return false;
  }
}

export function isCatalogSpellCombatReady(spell) {
  return spell.effects.length > 0 && spell.effects.every(isEffectConfigured);
}

export function createClientChampionCatalog(champions) {
  return champions.map((champion) => ({
    id: champion.id,
    key: champion.key,
    name: champion.name,
    title: champion.title,
    tags: champion.tags,
    resourceType: champion.resourceType,
    stats: champion.stats,
    spells: champion.spells.map((spell) => {
      const combatReady = isCatalogSpellCombatReady(spell);
      return {
        id: spell.id,
        name: spell.name,
        description: combatReady ? spell.description : '',
        maxRank: spell.maxRank,
        cooldown: [],
        cost: [],
        range: [],
        image: '',
        targeting: spell.targeting,
        scaling: { adRatio: 0, apRatio: 0 },
        effects: combatReady ? spell.effects : [],
      };
    }),
    passive: {
      name: champion.passive.name,
      description: '',
      image: '',
      targeting: champion.passive.targeting,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [],
    },
    iconUrl: champion.iconUrl,
  }));
}
