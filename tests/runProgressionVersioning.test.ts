import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import {
  getAuthorityChampionCatalogVersion,
  hasAuthorityFeature,
  isKnownAuthorityEngine,
} from '@/game/authority/versionRegistry';
import { BattleManager } from '@/game/battle/BattleManager';
import { ActionType } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { getRunChampionCatalog, getRunChampionForEngine } from '@/game/run/runChampionCatalog';
import { buildRunPlayerTeam } from '@/game/run/runCombatant';
import type { Champion, RunProgressionTargetTier } from '@/types/champion';
import { TargetingType } from '@/types/champion';
import { resolveRegisteredAuthorityVerifier } from './helpers/authorityBundleResolver';
import { importInstrumentedAuthorityBundle } from './helpers/instrumentedAuthorityCombatRuntime';
import {
  VEIGAR_FIRST_COMBAT_ATTEMPT,
  VEIGAR_FIRST_COMBAT_COMMANDS,
} from './helpers/veigarRunProgressionFixture';

const LEGACY_ENGINE = 'run-engine-v22';
const CURRENT_ENGINE = 'run-engine-0.2.0';
const LEGACY_HASH = '2e0c2b73796122049cd8493b56e9ed9329a9fde25e27addc71f553eb83025d84';
const KEY = 'veigar.phenomenal_power';
type BattleRuntime = Pick<typeof import('@/game/battle/BattleManager'), 'BattleManager'> & {
  ChampionInstance: typeof ChampionInstance;
  championDB: typeof championDB;
};
const liveRuntime: BattleRuntime = { BattleManager, ChampionInstance, championDB };

function battleChampion(base: Champion, damage: number, speed: number, passive = false): Champion {
  return {
    ...base,
    stats: {
      ...base.stats,
      hp: 1000,
      hpPerLevel: 0,
      mp: 1000,
      mpPerLevel: 0,
      armor: 0,
      magicResist: 0,
      attackDamage: 1,
      crit: 0,
      hpRegen: 0,
      moveSpeed: speed,
    },
    spells: base.spells.map((spell) => ({
      ...spell,
      cooldownTurns: [1],
      cost: [0],
      targeting: TargetingType.Enemy,
      effects: [{ type: 'damage', damageType: 'true', baseDamage: [damage] }],
    })),
    passive: passive ? base.passive : { ...base.passive, effects: [], runProgression: undefined },
  };
}

function assistBattle(runtime: BattleRuntime, engine: string, tier: RunProgressionTargetTier) {
  const veigarKit = getRunChampionForEngine(runtime.championDB.getById('Veigar')!, engine);
  const veigar = new runtime.ChampionInstance(battleChampion(veigarKit, 5, 500, true));
  const finisher = new runtime.ChampionInstance(
    battleChampion(runtime.championDB.getById('Garen')!, 2000, 490),
  );
  const target = new runtime.ChampionInstance(
    battleChampion(runtime.championDB.getById('Ashe')!, 1, 1),
  );
  const manager = new runtime.BattleManager(
    { side: 'player', champions: [veigar, finisher] },
    { side: 'enemy', champions: [target] },
    {
      autoActions: false,
      random: () => 0.99,
      combatantTiers: { Ashe: tier },
      runProgressionAssists: hasAuthorityFeature(engine, 'runProgressionAssists'),
    },
  );
  manager.startBattle();
  const cast = (champion: ChampionInstance) => {
    for (let turn = 0; manager.currentCombatant?.champion !== champion && turn < 50; turn++) {
      manager.processCurrentTurn();
    }
    expect(manager.currentCombatant?.champion).toBe(champion);
    expect(manager.submitAction({ type: ActionType.SpellQ, targetId: 'Ashe' })).toBe(true);
  };
  cast(veigar);
  expect(veigar.getRunCounter(KEY)).toBe(0);
  cast(finisher);
  return {
    counter: veigar.getRunCounter(KEY),
    gains: manager.log.filter((event) => event.type === 'run_counter_gain'),
    finalStates: manager.getFinalPlayerStates(),
    trace: manager.getPlayerActionTrace(),
  };
}

describe('run progression capability and historical replay', () => {
  it('resolves registered semver capabilities without accepting unregistered or prototype identities', () => {
    expect(isKnownAuthorityEngine(CURRENT_ENGINE)).toBe(true);
    expect(getAuthorityChampionCatalogVersion(CURRENT_ENGINE)).toBe(2);
    expect(hasAuthorityFeature(CURRENT_ENGINE, 'runProgressionAssists')).toBe(true);
    expect(hasAuthorityFeature(LEGACY_ENGINE, 'runProgression')).toBe(true);
    expect(hasAuthorityFeature(LEGACY_ENGINE, 'runProgressionAssists')).toBe(false);
    for (const engine of ['run-engine-v23', 'run-engine-0.2.1', '__proto__', 'constructor', '']) {
      expect(isKnownAuthorityEngine(engine), engine).toBe(false);
      expect(getAuthorityChampionCatalogVersion(engine), engine).toBeUndefined();
      expect(hasAuthorityFeature(engine, 'runProgressionAssists'), engine).toBe(false);
    }
  });

  it('filters historical passive hooks without mutating the maintained kit or changing the roster', () => {
    const live = championDB.getById('Veigar')!;
    const initial = structuredClone(live);
    const legacy = getRunChampionForEngine(live, LEGACY_ENGINE);
    expect(legacy.passive.runProgression?.[0]).not.toHaveProperty('onAssist');
    expect(legacy.passive.runProgression?.[0]?.onKill).toEqual(
      live.passive.runProgression?.[0]?.onKill,
    );
    expect(live.passive.runProgression?.[0]?.onAssist).toHaveLength(3);
    expect(getRunChampionForEngine(live, CURRENT_ENGINE)).toBe(live);
    expect(getRunChampionForEngine(live)).toBe(live);
    expect(live).toEqual(initial);
    expect(getRunChampionCatalog(LEGACY_ENGINE).map((champion) => champion.id)).toEqual(
      getRunChampionCatalog(CURRENT_ENGINE).map((champion) => champion.id),
    );
    expect(
      getRunChampionCatalog(LEGACY_ENGINE).find((champion) => champion.id === 'Veigar')?.passive
        .runProgression?.[0],
    ).not.toHaveProperty('onAssist');
  });

  it('restores v22 counters and frozen mastery while keeping assist hooks disabled', () => {
    const member = { championId: 'Veigar', level: 5, runProgress: { [KEY]: 17 } };
    const rules = {
      inventory: [],
      augmentIds: [],
      currentBiomeIndex: 1,
      getUnlockedEnhancements: () => ({}),
      getMasteryLevel: () => 4,
    };
    const [legacy] = buildRunPlayerTeam([member], { ...rules, engineVersion: LEGACY_ENGINE });
    const [current] = buildRunPlayerTeam([member], { ...rules, engineVersion: CURRENT_ENGINE });
    expect(legacy!.getPassive().runProgression?.[0]).not.toHaveProperty('onAssist');
    expect(current!.getPassive().runProgression?.[0]?.onAssist).toHaveLength(3);
    expect(legacy!.getRunCounter(KEY)).toBe(17);
    expect(legacy!.getEnhancedStats()).toEqual(current!.getEnhancedStats());
  });

  it.each([
    ['normal', 1],
    ['elite', 3],
    ['boss', 10],
  ] as const)(
    'preserves the exact frozen v22 %s assist trace while enabling the new reward',
    async (tier, reward) => {
      const frozen = await importInstrumentedAuthorityBundle(
        resolve(process.cwd(), 'supabase/authority-archive/run-authority-v22.bundle.ts'),
      );
      const historical = assistBattle(frozen as unknown as BattleRuntime, LEGACY_ENGINE, tier);
      expect(assistBattle(liveRuntime, LEGACY_ENGINE, tier)).toEqual(historical);
      expect(historical.counter).toBe(0);
      expect(historical.gains).toEqual([]);
      const current = assistBattle(liveRuntime, CURRENT_ENGINE, tier);
      expect(current.trace).toEqual(historical.trace);
      expect(current.counter).toBe(reward);
      expect(current.gains).toHaveLength(1);
      expect(current.gains[0]).toMatchObject({ source: 'Veigar', target: 'Ashe', amount: reward });
    },
  );

  it('pins the immutable v22 bytes and replays its existing Veigar combat without new assist rewards', async () => {
    const bytes = readFileSync(
      resolve(process.cwd(), 'supabase/authority-archive/run-authority-v22.bundle.ts'),
    );
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '0e158380fddc7e9174530e0e35915baa153abfa9646032bcd0a902b444fe1951',
    );
    const verifier = await resolveRegisteredAuthorityVerifier(LEGACY_ENGINE, LEGACY_HASH);
    expect(verifier).toBeDefined();
    const result = verifier!.replay(VEIGAR_FIRST_COMBAT_ATTEMPT, VEIGAR_FIRST_COMBAT_COMMANDS);
    expect(
      result.snapshot.team.find((member) => member.championId === 'Veigar')?.runProgress,
    ).toEqual({ [KEY]: 1 });
    expect(verifier!.replay(VEIGAR_FIRST_COMBAT_ATTEMPT, VEIGAR_FIRST_COMBAT_COMMANDS)).toEqual(
      result,
    );
  });
});
