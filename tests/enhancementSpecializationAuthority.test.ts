// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { CHAMPION_ENHANCEMENT_SPECIALIZATIONS } from '@/data/enhancementSpecializations';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  createAuthorityReplaySession,
  replayAuthorityRun,
  verifyAuthorityRun,
} from '@/game/authority';
import { encodeCombatActionTrace } from '@/game/battle/actionTrace';
import { BattleManager } from '@/game/battle/BattleManager';
import { ActionType } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { getEnhancementContractForChampion } from '@/game/enhancements/catalog';
import {
  previewEnhancementPurchase,
  validateEnhancementState,
} from '@/game/enhancements/eligibility';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import { getEnhancementSecondaryStats } from '@/game/rules/enhancementStats';
import { buildCombatRuleLoadout } from '@/game/rules/loadout';
import type { CombatRuleResolution } from '@/game/rules/types';
import { SeededRNG } from '@/utils/seededRandom';
import registry from '../config/authority-versions.json';
import {
  type AuthorityVerifier,
  resolveRegisteredAuthorityVerifier,
} from './helpers/authorityBundleResolver';
import {
  enhancementFirstBattle,
  enhancementResources,
  finishEnhancementBattle,
} from './helpers/enhancementParityFixtures';

interface PathFixture {
  championId: string;
  branchId: string;
  flat: Record<string, number>;
  percent: Record<string, number>;
  effectType?: string;
  effectValue?: number;
}

// These independent numerical expectations make an omitted or fictitious bonus fail
// even when source and bundled engines would agree on the same omission.
const paths: PathFixture[] = [
  { championId: 'Garen', branchId: 'garen_durability', flat: { armor: 6 }, percent: { hp: 0.05 } },
  {
    championId: 'Garen',
    branchId: 'garen_execution',
    flat: { attackDamage: 4 },
    percent: {},
    effectType: 'execute_damage',
    effectValue: 0.06,
  },
  {
    championId: 'Annie',
    branchId: 'annie_burst',
    flat: { abilityPower: 6 },
    percent: {},
    effectType: 'burst_amplify',
    effectValue: 0.06,
  },
  {
    championId: 'Annie',
    branchId: 'annie_control',
    flat: { abilityHaste: 4, magicResist: 6, mpRegen: 1 },
    percent: {},
  },
  {
    championId: 'Soraka',
    branchId: 'soraka_healing',
    flat: { abilityPower: 4 },
    percent: {},
    effectType: 'heal_amp',
    effectValue: 0.05,
  },
  {
    championId: 'Soraka',
    branchId: 'soraka_protection',
    flat: {},
    percent: { hp: 0.05 },
    effectType: 'ally_damage_reduction',
    effectValue: 0.04,
  },
  {
    championId: 'Jinx',
    branchId: 'jinx_sustained',
    flat: { attackDamage: 4 },
    percent: { attackSpeed: 0.04 },
  },
  {
    championId: 'Jinx',
    branchId: 'jinx_finisher',
    flat: { crit: 3 },
    percent: {},
    effectType: 'execute_damage',
    effectValue: 0.06,
  },
];
const ranksFor = (path: PathFixture) => ({ [`${path.branchId}_1`]: 1, [`${path.branchId}_2`]: 1 });

/** Models an already attested frozen input; it does not manufacture a SQL receipt. */
function frozenAttempt(path: PathFixture, seed: number): AuthorityRunAttempt {
  const ally = path.championId === 'Garen' ? 'Ashe' : 'Garen';
  return {
    runUuid: 'e5555555-5555-4555-8555-555555555555',
    seed,
    difficulty: 'easy',
    mode: 'normal',
    team: [{ championId: path.championId }, { championId: ally }],
    runeIds: [],
    enhancementSnapshot: { [path.championId]: ranksFor(path) },
    masterySnapshot: { [path.championId]: 4, [ally]: 4 },
  };
}

function loadoutFor(attempt: AuthorityRunAttempt) {
  return buildCombatRuleLoadout({
    championIds: attempt.team.map((entry) => entry.championId),
    runeIds: [],
    augmentIds: [],
    inventory: [],
    getUnlockedEnhancements: (id) => attempt.enhancementSnapshot[id] ?? {},
  });
}

afterEach(() => vi.restoreAllMocks());

describe('TREE-06: eight specialization paths through actual battle, authority and registered Edge', () => {
  let edge: AuthorityVerifier;
  beforeAll(async () => {
    const current = registry.versions.find((version) => version.status === 'current');
    expect(current).toMatchObject({ engine: 'run-engine-0.3.0', gameplay: 25, progression: 4 });
    expect(AUTHORITY_ENGINE_VERSION).toBe(current!.engine);
    expect(AUTHORITY_CONTENT_HASH).toBe(current!.contentHash);
    const resolved = await resolveRegisteredAuthorityVerifier(
      current!.engine,
      current!.contentHash,
    );
    expect(resolved).toBeDefined();
    edge = resolved!;
  });

  it('covers every authored path exactly once and both owned ranks in its frozen fixture', () => {
    const authored = Object.values(CHAMPION_ENHANCEMENT_SPECIALIZATIONS).flatMap((extension) =>
      extension.branches.map((branch) => branch.id),
    );
    expect(paths.map((path) => path.branchId).sort()).toEqual(authored.sort());
    expect(paths).toHaveLength(8);
    for (const path of paths) {
      const attempt = frozenAttempt(path, 17);
      const champion = championDB.getById(path.championId)!;
      const contract = getEnhancementContractForChampion(champion);
      const first = contract.nodes.find((node) => node.id === `${path.branchId}_1`)!;
      // Publication is closed; server-attested possessions remain legal capabilities.
      expect(
        previewEnhancementPurchase(first, {
          contract,
          unlockedNodes: {},
          masteryLevel: 4,
          availableCandies: 1000,
          enabledGates: [],
        }),
      ).toMatchObject({ eligible: false, reason: { code: 'gated' } });
      expect(
        validateEnhancementState(
          contract,
          { unlockedNodes: ranksFor(path), totalCandiesSpent: 200 },
          { masteryLevel: 4, enabledGates: ['champion_specializations'] },
        ),
      ).toMatchObject({ valid: true, activeRanks: ranksFor(path) });
      const loadout = loadoutFor(attempt);
      expect(loadout.enhancementStats[path.championId]).toMatchObject({
        flat: path.flat,
        percent: path.percent,
      });
      expect(loadout.enhancementStats[path.championId].flat).toEqual(path.flat);
      expect(loadout.enhancementStats[path.championId].percent).toEqual(path.percent);
      const effects = loadout.enhancementEffects[path.championId];
      if (path.effectType)
        expect(effects).toEqual([
          expect.objectContaining({ type: path.effectType, value: path.effectValue }),
        ]);
      else expect(effects).toEqual([]);
    }
  });

  it('rejects disabled ancestry, mutually exclusive paths, forged ranks and insufficient frozen mastery in source and Edge', () => {
    const garen = frozenAttempt(paths.find((path) => path.branchId === 'garen_execution')!, 17);
    const invalidAttempts: AuthorityRunAttempt[] = [
      { ...garen, enhancementSnapshot: { Garen: { fighter_duelist_1: 1 } } },
      { ...garen, enhancementSnapshot: { Garen: { fighter_duelist_1: 1, fighter_duelist_2: 1 } } },
      { ...garen, enhancementSnapshot: { Garen: { garen_durability_1: 1, garen_execution_1: 1 } } },
      { ...garen, enhancementSnapshot: { Garen: { garen_execution_1: 2 } } },
      { ...garen, enhancementSnapshot: { Garen: { jinx_finisher_1: 1 } } },
      { ...garen, masterySnapshot: { Garen: 1, Ashe: 4 } },
      { ...garen, masterySnapshot: {} },
    ];
    for (const invalid of invalidAttempts) {
      expect(verifyAuthorityRun(invalid, [], { requireTerminal: false })).toMatchObject({
        ok: false,
        error: { code: 'invalid_attempt' },
      });
      expect(edge.verify(invalid, [], { requireTerminal: false })).toMatchObject({
        ok: false,
        error: { code: 'invalid_attempt' },
      });
    }
  });

  it.each(paths.flatMap((path) => [17, 91].map((seed) => ({ ...path, seed }))))(
    '$branchId seed=$seed preserves stats, manual trace, ledger and reload in source and Edge',
    ({ seed, ...path }) => {
      const attempt = frozenAttempt(path, seed);
      const originalBytes = JSON.stringify(attempt);
      const automatic = enhancementFirstBattle(attempt, true);
      const neutral = enhancementFirstBattle({ ...attempt, enhancementSnapshot: {} }, true);
      const player = automatic.battle
        .getPlayerCombatants()
        .find((entry) => entry.champion.id === path.championId)!;
      const plain = neutral.battle
        .getPlayerCombatants()
        .find((entry) => entry.champion.id === path.championId)!;
      const actualStats = player.champion.getEnhancedStats();
      const baseline = plain.champion.getEnhancedStats();
      for (const stat of new Set([...Object.keys(path.flat), ...Object.keys(path.percent)])) {
        if (stat === 'abilityHaste') continue; // Secondary contribution is exercised through runtime below.
        const key = stat as keyof typeof actualStats;
        expect(actualStats[key], stat).toBeCloseTo(
          (baseline[key] + (path.flat[stat] ?? 0)) * (1 + (path.percent[stat] ?? 0)),
          9,
        );
      }
      const autoResult = finishEnhancementBattle(automatic.battle);
      const autoTrace = automatic.battle.getPlayerActionTrace();
      expect(autoTrace.length).toBeGreaterThan(0);
      const manual = enhancementFirstBattle(attempt, false);
      let cursor = 0;
      manual.battle.setActionCallback(() => autoTrace[cursor++] ?? null);
      const manualResult = finishEnhancementBattle(manual.battle);
      expect(manualResult).toEqual(autoResult);
      const trace = manual.battle.getPlayerActionTrace();
      expect(trace.every((action) => !action.automatic)).toBe(true);
      expect(trace.map(({ type, targetId }) => ({ type, targetId }))).toEqual(
        autoTrace.map(({ type, targetId }) => ({ type, targetId })),
      );
      const manualCommand: AuthorityRunCommand = {
        sequence: 2,
        kind: 'resolve_combat',
        payload: { node_id: manual.nodeId, actions_json: encodeCombatActionTrace(trace) },
      };
      const autoCommand: AuthorityRunCommand = {
        ...manualCommand,
        payload: { node_id: manual.nodeId, actions_json: 'auto' },
      };
      const commands = [manual.move, manualCommand];
      const source = replayAuthorityRun(attempt, commands);
      const canonicalAuto = replayAuthorityRun(attempt, [automatic.move, autoCommand]);
      expect(canonicalAuto).toEqual(source);
      expect(source.combatSummaries[0]).toMatchObject({
        metrics: manualResult.metrics,
        rounds: manualResult.totalRounds,
        playerTeam: { final: enhancementResources(manual.battle.getPlayerCombatants()) },
        enemyTeam: { final: enhancementResources(manual.battle.getEnemyCombatants()) },
      });
      expect(edge.replay(attempt, commands)).toEqual(source);
      expect(edge.replay(attempt, [automatic.move, autoCommand])).toEqual(source);
      expect(edge.verify(attempt, commands, { requireTerminal: false })).toEqual(
        verifyAuthorityRun(attempt, commands, { requireTerminal: false }),
      );
      expect(verifyAuthorityRun(attempt, commands, { requireTerminal: false }).ok).toBe(true);
      expect(source.snapshot.ledger).toEqual(canonicalAuto.snapshot.ledger);
      expect(edge.replay(attempt, commands).snapshot.ledger).toEqual(source.snapshot.ledger);
      // A later account reset or gate change never rewrites either session's clone.
      const account = structuredClone(attempt);
      const sourceSession = createAuthorityReplaySession(account);
      const edgeSession = edge.createSession(account);
      sourceSession.append(manual.move);
      edgeSession.append(manual.move);
      expect(edgeSession.getResult()).toEqual(sourceSession.getResult());
      account.enhancementSnapshot[path.championId] = {};
      sourceSession.append(manualCommand);
      edgeSession.append(manualCommand);
      expect(sourceSession.getResult()).toEqual(source);
      expect(edgeSession.getResult()).toEqual(source);
      const reloaded = JSON.parse(JSON.stringify({ attempt, commands }));
      expect(edge.replay(reloaded.attempt, reloaded.commands)).toEqual(source);
      expect(JSON.stringify(attempt)).toBe(originalBytes);
    },
  );
});

// A short first encounter does not guarantee an ultimate/heal/low-HP trigger.
// These separate real-kit battles force the published conditions without claiming
// that the authority fixture or a human playtest necessarily reached them.
describe('TREE-06: specialization conditions are consumed in the real BattleManager', () => {
  it.each(paths.filter((path) => path.effectType))(
    '$branchId applies its actual conditional effect',
    (path) => {
      const attempt = frozenAttempt(path, 17);
      const loadout = loadoutFor(attempt);
      const rules = new CombatRuleRuntime(loadout, () => 0.5);
      const dispatch = vi.spyOn(rules, 'dispatch');
      const champion = new ChampionInstance(championDB.getById(path.championId)!, 5);
      champion.setEnhancementBonuses(loadout.enhancementStats[path.championId]);
      const ally = new ChampionInstance(
        championDB.getById(path.championId === 'Garen' ? 'Soraka' : 'Garen')!,
        5,
      );
      const enemy = new ChampionInstance(championDB.getById('Darius')!, 5);
      const rng = new SeededRNG(17);
      const battle = new BattleManager(
        { side: 'player', champions: [champion, ally] },
        { side: 'enemy', champions: [enemy] },
        {
          autoActions: false,
          maxRounds: 20,
          rules,
          random: () => rng.next(),
          initialHpOverrides: {
            Darius: enemy.getEnhancedStats().hp * 0.39,
            [ally.id]: ally.getEnhancedStats().hp * 0.2,
          },
        },
      );
      battle.setActionCallback((actor, _side, enemies, allies) => {
        const available = battle.getAvailableActions(actor);
        if (actor.id === 'Annie' && available.some((action) => action.type === ActionType.SpellR))
          return { type: ActionType.SpellR, targetId: enemies[0]?.targetId };
        if (actor.id === 'Soraka' && available.some((action) => action.type === ActionType.SpellW))
          return {
            type: ActionType.SpellW,
            targetId: allies.find((entry) => entry.champion.id !== actor.id)?.targetId,
          };
        return { type: ActionType.BasicAttack, targetId: enemies[0]?.targetId };
      });
      const result = finishEnhancementBattle(battle);
      const observed = dispatch.mock.calls.map(([event], index) => ({
        event,
        resolution: dispatch.mock.results[index].value as CombatRuleResolution,
      }));
      const contribution = observed.find(({ event, resolution }) => {
        if (path.effectType === 'heal_amp')
          return (
            event.type === 'before_heal' &&
            event.source.id === path.championId &&
            resolution.healMultiplier === 1.05
          );
        if (path.effectType === 'ally_damage_reduction')
          return (
            event.type === 'before_damage' &&
            event.target.side === 'player' &&
            resolution.damageReduction === 0.04
          );
        return (
          event.type === 'before_damage' &&
          event.source.id === path.championId &&
          resolution.damageMultiplier === 1.06 &&
          (path.effectType !== 'burst_amplify' || event.action === ActionType.SpellR)
        );
      });
      expect(contribution, `${path.branchId}: no conditional contribution consumed`).toBeDefined();
      if (path.effectType === 'heal_amp')
        expect(result.metrics.bySide.player.healingDone).toBeGreaterThan(0);
      else expect(result.metrics.bySide.player.hpDamageDealt).toBeGreaterThan(0);
    },
  );

  it('Annie control contributes four haste points and one mana per turn through the battle runtime', () => {
    const path = paths.find((entry) => entry.branchId === 'annie_control')!;
    const loadout = loadoutFor(frozenAttempt(path, 17));
    expect(getEnhancementSecondaryStats(loadout.enhancementStats.Annie).abilityHaste).toBe(4);
    const rules = new CombatRuleRuntime(loadout, () => 0.5);
    const cooldown = vi.spyOn(rules, 'getCooldownMultiplier');
    const dispatch = vi.spyOn(rules, 'dispatch');
    const annie = new ChampionInstance(championDB.getById('Annie')!, 5);
    annie.setEnhancementBonuses(loadout.enhancementStats.Annie);
    const enemy = new ChampionInstance(championDB.getById('Darius')!, 5);
    const battle = new BattleManager(
      { side: 'player', champions: [annie] },
      { side: 'enemy', champions: [enemy] },
      { autoActions: false, rules, random: () => 0.5, initialMpOverrides: { Annie: 100 } },
    );
    battle.setActionCallback((_actor, _side, enemies) => ({
      type: ActionType.SpellQ,
      targetId: enemies[0]?.targetId,
    }));
    finishEnhancementBattle(battle);
    expect(
      cooldown.mock.results.some((entry) => entry.type === 'return' && entry.value === 100 / 104),
    ).toBe(true);
    expect(
      dispatch.mock.calls.some(
        ([event], index) =>
          event.type === 'turn_start' &&
          event.actor.id === 'Annie' &&
          (dispatch.mock.results[index].value as CombatRuleResolution).instantEffects.some(
            (effect) => effect.type === 'mana' && effect.amount === 1,
          ),
      ),
    ).toBe(true);
  });
});
