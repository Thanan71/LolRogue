/**
 * Ability Parser — validates the shipped, implemented champion catalogue.
 */

import { describe, expect, it } from 'vitest';
import championsRaw from '../src/data/generated/champions-parsed.json';
import manifestRaw from '../src/data/generated/riot-assets-manifest.json';
import type { Champion } from '../src/types';

const champions = championsRaw as Champion[];
const manifest = manifestRaw as { champions: string[] };
const VALID_TARGETINGS = ['self', 'ally', 'enemy', 'area', 'passive'];
const VALID_EFFECT_TYPES = ['damage', 'heal', 'shield', 'cc', 'buff', 'debuff', 'execute'];
const VALID_DAMAGE_TYPES = ['physical', 'magical', 'true'];
const VALID_CC_TYPES = ['stun', 'snare', 'slow', 'silence', 'knockup', 'charm'];

describe('shipped champion ability catalogue', () => {
  it('contains exactly the manifested server catalogue and versioned absolute icons', () => {
    expect(champions.map((champion) => champion.id)).toEqual(manifest.champions);
    for (const champion of champions) {
      expect(champion.iconUrl).toMatch(
        new RegExp(`^/assets/riot/\\d+\\.\\d+\\.\\d+/champions/${champion.id}\\.png$`),
      );
    }
  });

  it('ships four structurally valid spells for every champion', () => {
    for (const champion of champions) {
      expect(champion.spells).toHaveLength(4);
      for (const spell of champion.spells) {
        expect(VALID_TARGETINGS).toContain(spell.targeting);
        expect(spell.scaling.adRatio).toBeGreaterThanOrEqual(0);
        expect(spell.scaling.apRatio).toBeGreaterThanOrEqual(0);
        expect(spell.cooldown.length).toBeGreaterThan(0);
        expect(spell.cost.length).toBeGreaterThan(0);
        expect(spell.range.length).toBeGreaterThan(0);
        for (const effect of spell.effects) {
          expect(VALID_EFFECT_TYPES).toContain(effect.type);
          if (effect.type === 'damage') {
            expect(VALID_DAMAGE_TYPES).toContain(effect.damageType);
          }
          if (effect.type === 'cc') {
            expect(VALID_CC_TYPES).toContain(effect.ccType);
          }
        }
      }
    }
  });

  it('ships one valid passive for every champion', () => {
    for (const champion of champions) {
      expect(champion.passive.name).toBeTruthy();
      expect(champion.passive.description).toBeTruthy();
      expect(VALID_TARGETINGS).toContain(champion.passive.targeting);
      expect(champion.passive.scaling.adRatio).toBeGreaterThanOrEqual(0);
      expect(champion.passive.scaling.apRatio).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(champion.passive.effects)).toBe(true);
    }
  });

  it('keeps the curated Lux spell corrections in the shipped subset', () => {
    const lux = champions.find((champion) => champion.id === 'Lux');
    expect(lux).toBeDefined();
    expect(lux!.spells[0].effects).toContainEqual(
      expect.objectContaining({ type: 'cc', ccType: 'snare' }),
    );
    expect(lux!.spells[3].scaling.apRatio).toBe(1);
  });
});
