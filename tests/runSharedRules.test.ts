import { describe, expect, it } from 'vitest';
import { AUGMENT_DATABASE } from '@/data/items';
import type {
  EventEncounter,
  RecruitEncounter,
  RestEncounter,
  ShopEncounter,
} from '@/game/map/types';
import { validateAugmentSelection } from '@/game/run/augmentSelectionRules';
import { resolvePostCombatTeam } from '@/game/run/postCombatRules';
import {
  getItemSaleGold,
  getShopItemCost,
  getShopRecruitCost,
  resolveEventTeamUpdates,
  resolveRecruitAttempt,
  resolveRestHp,
  resolveRestMp,
  resolveRunEvent,
} from '@/game/run/runEncounterRules';

describe('shared deterministic run rules', () => {
  it('uses one canonical pricing contract for shop purchases, recruits and sales', () => {
    const shop = {
      priceMultiplier: 1.25,
    } as ShopEncounter;

    expect({
      discountedItem: getShopItemCost(shop, 100, 0.2),
      cappedDiscount: getShopItemCost(shop, 100, 2),
      recruit: getShopRecruitCost(shop, 90),
      sale: getItemSaleGold(125),
    }).toEqual({
      discountedItem: 100,
      cappedDiscount: 25,
      recruit: 113,
      sale: 62,
    });
  });

  it('replays recruit and event RNG from only the seed and encounter identity', () => {
    const seed = 9_001;
    const recruit: RecruitEncounter = {
      id: 'golden-recruit',
      name: 'Recruit',
      description: 'Recruit',
      type: 'recruit',
      minRunLevel: 1,
      championId: 'Lux',
      cost: 75,
      successChance: 0.6,
      statMultiplier: 1.1,
    };
    const event: EventEncounter = {
      id: 'golden-event',
      name: 'Event',
      description: 'Event',
      type: 'event',
      minRunLevel: 1,
      outcomes: [
        { type: 'gold_reward', weight: 2, description: 'gold', goldAmount: 50 },
        { type: 'damage', weight: 1, description: 'damage', damagePercent: 0.2 },
      ],
    };

    expect(resolveRecruitAttempt(seed, recruit)).toEqual(resolveRecruitAttempt(seed, recruit));
    expect(resolveRunEvent(seed, event, 500)).toEqual(resolveRunEvent(seed, event, 500));
  });

  it('applies rest, event HP changes and stat boosts through the same health rules', () => {
    const member = { championId: 'Garen', currentHp: 40, statBoosts: {} };
    const rest = { fullHeal: false, healPercent: 0.25 } as RestEncounter;

    expect(resolveRestHp(member.currentHp, 100, rest)).toBe(65);
    expect(resolveRestMp(100)).toBe(100);
    expect(resolveRestMp(0)).toBe(0);
    expect(
      resolveEventTeamUpdates(
        { type: 'damage', weight: 1, damagePercent: 0.5, description: 'hit' },
        [member],
        () => 100,
      )[0]?.currentHp,
    ).toBe(20);
    expect(
      resolveEventTeamUpdates(
        {
          type: 'stat_boost',
          weight: 1,
          description: 'stronger',
          statBoost: { stat: 'hp', amount: 20 },
        },
        [member],
        () => 120,
      )[0],
    ).toMatchObject({ currentHp: 40, statBoosts: { hp: 20 } });
  });

  it('shares augment offer validation and the full post-combat resource/XP transition', () => {
    const augmentId = Object.keys(AUGMENT_DATABASE)[0];
    expect(augmentId).toBeTruthy();
    expect(validateAugmentSelection([augmentId!], [], augmentId!)).toEqual({ valid: true });
    expect(validateAugmentSelection([], [], augmentId!)).toMatchObject({
      valid: false,
      code: 'no_pending_augment',
    });

    expect(
      resolvePostCombatTeam({
        team: [{ championId: 'Garen', level: 1, currentXp: 0 }],
        finalPlayerStates: [{ championId: 'Garen', currentHp: 50, currentMp: 25 }],
        xpPerChampion: 100,
        healAfterBattlePercent: 0.1,
        getPreLevelMaxHp: () => 100,
        getPreLevelMaxMp: () => 100,
      }),
    ).toMatchObject({
      updates: [
        {
          championId: 'Garen',
          currentHp: 60,
          currentMp: 50,
          level: 2,
          currentXp: 0,
        },
      ],
      pendingSpellUpgradeChampionIds: ['Garen'],
      levelsGained: 1,
    });
  });

  it('recovers 25 percent mana after victory with resource bounds', () => {
    const resolve = (currentMp: number, maxMp: number) =>
      resolvePostCombatTeam({
        team: [{ championId: 'Ashe', level: 1, currentXp: 0 }],
        finalPlayerStates: [{ championId: 'Ashe', currentHp: 100, currentMp }],
        xpPerChampion: 0,
        healAfterBattlePercent: 0,
        getPreLevelMaxHp: () => 100,
        getPreLevelMaxMp: () => maxMp,
      }).updates[0]?.currentMp;

    expect(resolve(25, 100)).toBe(50);
    expect(resolve(95, 100)).toBe(100);
    expect(resolve(0, 0)).toBe(0);
    expect(resolve(0, 101)).toBe(25);
  });
});
