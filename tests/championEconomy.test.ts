import { describe, expect, it } from 'vitest';
import { implementedChampions } from '@/data/champion';
import {
  CHAMPION_ECONOMY_CATALOG,
  calculateShardReward,
  ECONOMY_V1_CHAMPION_IDS,
  getChampionAccess,
  getRotationForInstant,
  PERMANENT_FREE_CHAMPION_IDS,
} from '@/domain/championEconomy';
import type { ChampionEconomySnapshot } from '@/types/championEconomy';

function snapshot(instant = '2026-10-08T12:00:00Z'): ChampionEconomySnapshot {
  return {
    enabled: true,
    economyVersion: 1,
    catalogVersion: 1,
    gameplayRulesetVersion: 21,
    serverNow: instant,
    rotation: getRotationForInstant(instant, 21),
    catalog: CHAMPION_ECONOMY_CATALOG.map((entry) => ({ ...entry })),
    wallet: { shardsBalance: 400, lifetimeEarned: 400, lifetimeSpent: 0 },
    ownedChampionIds: [],
    firstWinChampionIds: [],
  };
}

describe('versioned champion economy', () => {
  it('contains precisely the implemented v21 roster and one canonical price', () => {
    expect([...ECONOMY_V1_CHAMPION_IDS]).toEqual(implementedChampions.map((c) => c.id).sort());
    expect(new Set(CHAMPION_ECONOMY_CATALOG.map((entry) => entry.priceShards))).toEqual(
      new Set([400]),
    );
  });

  it.each([
    ['2026-10-11T23:59:59Z', '2026-W41-v1-r21', '2026-10-05T00:00:00.000Z'],
    ['2026-10-12T00:00:00Z', '2026-W42-v1-r21', '2026-10-12T00:00:00.000Z'],
    ['2027-01-03T23:59:59Z', '2026-W53-v1-r21', '2026-12-28T00:00:00.000Z'],
    ['2027-01-04T00:00:00Z', '2027-W01-v1-r21', '2027-01-04T00:00:00.000Z'],
    ['2025-12-29T00:00:00Z', '2026-W01-v1-r21', '2025-12-29T00:00:00.000Z'],
    ['2023-01-01T23:59:59Z', '2022-W52-v1-r21', '2022-12-26T00:00:00.000Z'],
  ])('resolves ISO and UTC boundary %s', (instant, id, monday) => {
    const rotation = getRotationForInstant(instant, 21);
    expect(rotation.id).toBe(id);
    expect(rotation.startsAt).toBe(monday);
    expect(Date.parse(rotation.endsAt) - Date.parse(rotation.startsAt)).toBe(604_800_000);
  });

  it('keeps exactly five distinct non permanent champions and changes for two boundaries', () => {
    const rotations = ['2026-10-05', '2026-10-12', '2026-10-19'].map((date) =>
      getRotationForInstant(`${date}T00:00:00Z`, 21),
    );
    for (const rotation of rotations) {
      expect(new Set(rotation.championIds).size).toBe(5);
      expect(rotation.championIds.some((id) => PERMANENT_FREE_CHAMPION_IDS.includes(id))).toBe(
        false,
      );
    }
    expect(rotations[0].championIds).not.toEqual(rotations[1].championIds);
    expect(rotations[1].championIds).not.toEqual(rotations[2].championIds);
    expect(getRotationForInstant('2026-10-08T12:00:00Z', 21).championIds).toEqual(
      rotations[0].championIds,
    );
  });

  it('supports a small versioned pool without duplicates or an invented champion', () => {
    expect(
      getRotationForInstant('2026-10-08T12:00:00Z', 22, ['Garen', 'Lux', 'Lux']).championIds,
    ).toEqual(['Lux']);
    expect(getRotationForInstant('2026-10-08T12:00:00Z', 22, ['Annie']).championIds).toEqual([]);
    expect(() => getRotationForInstant('invalid', 21)).toThrow('invalid_rotation_input');
  });

  it('resolves permanent, owned, rotation and locked, with exact exclusive expiry', () => {
    const current = snapshot();
    const rotating = current.rotation?.championIds[0] as string;
    const locked = current.catalog.find(
      (entry) => !entry.permanentFree && !current.rotation?.championIds.includes(entry.championId),
    )?.championId as string;
    expect(getChampionAccess('Garen', current)).toBe('permanent_free');
    expect(getChampionAccess(rotating, current)).toBe('weekly_rotation');
    expect(getChampionAccess(locked, current)).toBe('locked');
    expect(getChampionAccess('not_implemented', current)).toBe('locked');
    expect(
      getChampionAccess(rotating, current, Date.parse(current.rotation?.endsAt as string)),
    ).toBe('locked');
    current.ownedChampionIds.push(rotating);
    expect(
      getChampionAccess(rotating, current, Date.parse(current.rotation?.endsAt as string)),
    ).toBe('owned');
    current.enabled = false;
    for (const id of ECONOMY_V1_CHAMPION_IDS)
      expect(getChampionAccess(id, current)).toBe('permanent_free');
  });

  it.each([
    [0, 0, false, 0],
    [1, 0, false, 25],
    [7, 2, false, 45],
    [30, 6, true, 135],
  ])(
    'rewards verified waves=%i biomes=%i won=%s',
    (wavesCompleted, biomesCompleted, won, total) => {
      expect(
        calculateShardReward({
          wavesCompleted,
          biomesCompleted,
          won,
          rotationChampionIds: [],
          teamChampionIds: ['Garen'],
          claimedChampionIds: [],
        }).totalShards,
      ).toBe(total);
    },
  );

  it('awards once per rotation champion, never multiplies base and leaves losses eligible', () => {
    const input = {
      wavesCompleted: 30,
      biomesCompleted: 6,
      won: true,
      rotationChampionIds: ['Lux', 'Leona'],
      teamChampionIds: ['Lux', 'Leona', 'Lux', 'Garen'],
      claimedChampionIds: ['Leona'],
    };
    expect(calculateShardReward(input)).toMatchObject({
      baseShards: 135,
      firstWinChampionIds: ['Lux'],
      firstWinShards: 50,
      totalShards: 185,
    });
    expect(
      calculateShardReward({ ...input, claimedChampionIds: ['Lux', 'Leona'] }).totalShards,
    ).toBe(135);
    expect(calculateShardReward({ ...input, won: false }).firstWinChampionIds).toEqual([]);
    expect(calculateShardReward({ ...input, teamChampionIds: ['Garen'] }).baseShards).toBe(135);
    expect(() => calculateShardReward({ ...input, wavesCompleted: 0 })).toThrow(
      'invalid_shard_reward_input',
    );
    expect(() => calculateShardReward({ ...input, biomesCompleted: 7 })).toThrow(
      'invalid_shard_reward_input',
    );
  });
});
