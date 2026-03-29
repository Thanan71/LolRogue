/**
 * Recruitment Service — Phase 3
 *
 * Handles wild champion encounters, biome-specific probability weights,
 * gold cost calculation, and shop rotation generation.
 *
 * Each biome favors certain champion tags/roles:
 *   top_lane  → Fighter, Tank
 *   jungle    → Fighter, Assassin
 *   mid_lane  → Mage, Assassin
 *   bot_lane  → Marksman, Support
 *   river     → (mixed, slightly weighted toward Fighter/Mage)
 *   base      → (uniform — all roles equally likely)
 */

import type { Biome } from '@/types/run';
import type { Champion, ChampionTag } from '@/types/champion';
import { championDB } from '@/data/championDatabase';
import { implementedChampions } from '@/data/champion';

// ─── Types ────────────────────────────────────────────────────────────────

/** A champion offered for recruitment with cost and context */
export interface RecruitOffer {
  champion: Champion;
  cost: number;
  /** Weight used during selection (for UI display / debugging) */
  weight: number;
}

/** Configuration for the recruitment shop */
export interface RecruitmentConfig {
  /** Number of champions to offer (default 3) */
  offerCount: number;
  /** Base gold cost for a champion recruit */
  baseCost: number;
  /** Cost scaling per run level */
  costPerLevel: number;
  /** Random cost variance ± (as fraction of base) */
  costVariance: number;
  /** Price discount multiplier (1.0 = normal, <1 = discount) */
  priceMultiplier: number;
}

export const DEFAULT_RECRUITMENT_CONFIG: RecruitmentConfig = {
  offerCount: 3,
  baseCost: 100,
  costPerLevel: 35,
  costVariance: 0.25,
  priceMultiplier: 1.0,
};

// ─── Biome Tag Weights ────────────────────────────────────────────────────

/**
 * Weight multipliers per champion tag in each biome.
 * Higher weight = more likely to appear in that biome's recruit pool.
 * Tags not listed default to weight 1.0.
 */
export const BIOME_TAG_WEIGHTS: Record<Biome, Partial<Record<ChampionTag, number>>> = {
  top_lane: {
    Fighter: 3.0, Tank: 2.5, Mage: 0.5, Marksman: 0.3, Support: 0.4, Assassin: 0.5,
  },
  jungle: {
    Fighter: 2.0, Assassin: 2.5, Tank: 1.5, Mage: 0.7, Marksman: 0.5, Support: 0.3,
  },
  mid_lane: {
    Mage: 3.0, Assassin: 2.5, Fighter: 0.8, Marksman: 0.5, Tank: 0.5, Support: 0.6,
  },
  bot_lane: {
    Marksman: 3.0, Support: 2.5, Mage: 1.0, Fighter: 0.4, Tank: 0.5, Assassin: 0.6,
  },
  river: {
    Fighter: 1.5, Mage: 1.5, Tank: 1.2, Assassin: 1.2, Marksman: 0.8, Support: 0.8,
  },
  base: {
    Fighter: 1.0, Mage: 1.0, Assassin: 1.0, Tank: 1.0, Marksman: 1.0, Support: 1.0,
  },
};

// ─── Cost Calculation ─────────────────────────────────────────────────────

/**
 * Calculate the selection weight for a champion in a specific biome.
 * Higher weight = more likely to appear in recruit encounters.
 */
export function getChampionWeight(champion: Champion, biome: Biome): number {
  const weights = BIOME_TAG_WEIGHTS[biome];
  let totalWeight = 0;
  for (const tag of champion.tags) {
    totalWeight += weights[tag] ?? 1.0;
  }
  return totalWeight / Math.max(1, champion.tags.length);
}

/**
 * Calculate the gold cost to recruit a champion.
 * Formula: (baseCost + runLevel * costPerLevel) * priceMultiplier * rarityFactor * biomeRelevance * (1 ± variance)
 */
export function calculateRecruitCost(
  champion: Champion,
  runLevel: number,
  biome: Biome,
  config: RecruitmentConfig = DEFAULT_RECRUITMENT_CONFIG,
  rand: () => number = Math.random,
): number {
  const base = config.baseCost + runLevel * config.costPerLevel;
  const rarityFactor = champion.tags.length >= 2 ? 0.9 : 1.0;
  const biomeRelevance = getBiomeRelevanceFactor(champion, biome);
  const variance = 1 + (rand() * 2 - 1) * config.costVariance;
  const cost = base * config.priceMultiplier * rarityFactor * biomeRelevance * variance;
  return Math.round(cost / 5) * 5;
}

function getBiomeRelevanceFactor(champion: Champion, biome: Biome): number {
  const weights = BIOME_TAG_WEIGHTS[biome];
  let maxWeight = 0;
  for (const tag of champion.tags) {
    const w = weights[tag] ?? 1.0;
    if (w > maxWeight) maxWeight = w;
  }
  if (maxWeight >= 2.5) return 0.85;
  if (maxWeight >= 2.0) return 0.9;
  if (maxWeight >= 1.5) return 0.95;
  return 1.1;
}

// ─── Weighted Selection ───────────────────────────────────────────────────

interface WeightedEntry {
  champion: Champion;
  weight: number;
}

function getWeightedPool(biome: Biome, excludeIds: string[]): WeightedEntry[] {
  const exclude = new Set(excludeIds.map((id) => id.toLowerCase()));
  return implementedChampions
    .filter((c) => !exclude.has(c.id.toLowerCase()))
    .map((champion) => ({
      champion,
      weight: getChampionWeight(champion, biome),
    }));
}

function weightedPick(
  pool: WeightedEntry[],
  rand: () => number,
  exclude: Set<string> = new Set(),
): WeightedEntry | null {
  const eligible = pool.filter((e) => !exclude.has(e.champion.id));
  if (eligible.length === 0) return null;
  const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
  let roll = rand() * totalWeight;
  for (const entry of eligible) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return eligible[eligible.length - 1];
}
// Public API

export function generateRecruitOffers(
  biome: Biome,
  runLevel: number,
  excludeIds: string[] = [],
  config: RecruitmentConfig = DEFAULT_RECRUITMENT_CONFIG,
  rand: () => number = Math.random,
): RecruitOffer[] {
  const pool = getWeightedPool(biome, excludeIds);
  if (pool.length === 0) return [];
  const offerCount = Math.min(config.offerCount, pool.length);
  const offers: RecruitOffer[] = [];
  const selected = new Set<string>();
  for (let i = 0; i < offerCount; i++) {
    const chosen = weightedPick(pool, rand, selected);
    if (!chosen) break;
    selected.add(chosen.champion.id);
    offers.push({
      champion: chosen.champion,
      cost: calculateRecruitCost(chosen.champion, runLevel, biome, config, rand),
      weight: chosen.weight,
    });
  }
  return offers;
}

export function generateShopRotation(
  biome: Biome,
  runLevel: number,
  teamIds: string[] = [],
  count: number = 2,
  rand: () => number = Math.random,
): { championId: string; cost: number }[] {
  const config: RecruitmentConfig = {
    ...DEFAULT_RECRUITMENT_CONFIG,
    offerCount: count,
    priceMultiplier: 1.0,
  };
  const offers = generateRecruitOffers(biome, runLevel, teamIds, config, rand);
  return offers.map((offer) => ({
    championId: offer.champion.id,
    cost: offer.cost,
  }));
}

export function generateWildRecruit(
  biome: Biome,
  runLevel: number,
  teamIds: string[] = [],
  rand: () => number = Math.random,
): { championId: string; cost: number; successChance: number; statMultiplier: number } | null {
  const pool = getWeightedPool(biome, teamIds);
  if (pool.length === 0) return null;
  const chosen = weightedPick(pool, rand);
  if (!chosen) return null;
  const cost = calculateRecruitCost(chosen.champion, runLevel, biome, DEFAULT_RECRUITMENT_CONFIG, rand);
  const baseChance = 0.85 - runLevel * 0.03;
  const successChance = Math.max(0.5, Math.min(0.95, baseChance + (rand() * 0.2 - 0.1)));
  const statMultiplier = Math.round((0.8 + rand() * 0.4) * 100) / 100;
  return {
    championId: chosen.champion.id,
    cost,
    successChance: Math.round(successChance * 100) / 100,
    statMultiplier,
  };
}
