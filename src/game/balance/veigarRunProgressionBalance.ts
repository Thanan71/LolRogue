import type { AuthorityDifficulty, AuthorityRunSnapshot } from '@/game/authority/types';
import type { BattleManager } from '@/game/battle/BattleManager';
import { ActionType, BattlePhase } from '@/game/battle/types';
import type { ChampionInstance } from '@/game/ChampionInstance';
import type { Champion } from '@/types/champion';
import type { Biome } from '@/types/run';
import {
  type AuthorityCohortRuntime,
  createBalanceReproductionCommand,
  simulateAuthorityCohort,
} from './authorityCohort';
import { createAuthorityCohortSeeds } from './authorityCohortProfiles';
import { type BalanceScenario, survivalGreedyPolicy } from './balancePolicy';
import { createChampionCombatMatrixRandom } from './championCombatMatrix';

export const VEIGAR_BALANCE_SEEDS = createAuthorityCohortSeeds(30);
export const VEIGAR_BALANCE_CHAMPIONS = ['Veigar', 'Annie', 'Lux'] as const;
export const VEIGAR_COUNTER_KEY = 'veigar.phenomenal_power';
const CHECKPOINT_BIOMES = [
  'top_lane',
  'jungle',
  'mid_lane',
  'base',
] as const satisfies readonly Biome[];

export function createVeigarBalanceScenario(
  championId: string,
  difficulty: AuthorityDifficulty = 'normal',
): BalanceScenario {
  return {
    id: `veigar-v22-garen-${championId.toLowerCase()}-${difficulty}-fresh`,
    difficulty,
    team: [{ championId: 'Garen' }, { championId }],
    runeIds: [],
    masterySnapshot: {},
    enhancementSnapshot: {},
  };
}

interface BiomeObservation {
  seed: number;
  biome: Biome;
  championAlive: boolean;
  counter: number;
  cumulativeDamage: number;
}

export interface VeigarBalanceRunObservation {
  seed: number;
  won: boolean;
  endBiome: Biome | null;
  endReason: string | null;
  totalDamage: number;
  teamDamage: number;
  combatWins: number;
  combatCount: number;
  finalCounter: number;
  maxCounter: number;
  finalTeamSize: number;
  checkpoints: BiomeObservation[];
  reachedSnapshots: BiomeObservation[];
  reproductionCommand: string;
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Every denominator is explicit; a run that died before a biome does not become a zero survivor. */
export function summarizeVeigarBalanceRuns(runs: readonly VeigarBalanceRunObservation[]) {
  const combatCount = runs.reduce((sum, run) => sum + run.combatCount, 0);
  const combatWins = runs.reduce((sum, run) => sum + run.combatWins, 0);
  const runWins = runs.filter((run) => run.won).length;
  return {
    runs: runs.length,
    runWins,
    runWinRate: runs.length ? runWins / runs.length : null,
    combatCount,
    combatWins,
    combatWinRate: combatCount ? combatWins / combatCount : null,
    mageDamageMeanAllRuns: mean(runs.map((run) => run.totalDamage)),
    teamDamageMeanAllRuns: mean(runs.map((run) => run.teamDamage)),
    finalCounterMeanAllRuns: mean(runs.map((run) => run.finalCounter)),
    maxCounterObserved: Math.max(0, ...runs.map((run) => run.maxCounter)),
    finalTeamSizeMean: mean(runs.map((run) => run.finalTeamSize)),
    biomeCheckpoints: CHECKPOINT_BIOMES.map((biome) => {
      const observations = runs.flatMap((run) =>
        run.checkpoints.filter((entry) => entry.biome === biome),
      );
      const reached = runs.flatMap((run) =>
        run.reachedSnapshots.filter((entry) => entry.biome === biome),
      );
      const alive = observations.filter((entry) => entry.championAlive);
      return {
        biome,
        startedRuns: runs.length,
        reachedRuns: reached.length,
        aliveReachedChampions: reached.filter((entry) => entry.championAlive).length,
        counterMeanReachedSnapshots: mean(reached.map((entry) => entry.counter)),
        permanentAPBonusMeanReachedSnapshots: mean(reached.map((entry) => entry.counter)),
        completedRuns: observations.length,
        completionRate: runs.length ? observations.length / runs.length : null,
        championSurvivors: alive.length,
        counterMeanSurvivors: mean(alive.map((entry) => entry.counter)),
        permanentAPBonusMeanSurvivors: mean(alive.map((entry) => entry.counter)),
        cumulativeMageDamageMeanSurvivors: mean(alive.map((entry) => entry.cumulativeDamage)),
        maxCounterSurvivors: alive.length ? Math.max(...alive.map((entry) => entry.counter)) : null,
      };
    }),
  };
}

function snapshotMage(snapshot: AuthorityRunSnapshot, championId: string) {
  const member = snapshot.team.find((entry) => entry.championId === championId);
  if (!member)
    throw new Error(`Focal champion ${championId} is missing from an observed snapshot.`);
  return {
    championAlive: member.currentHp === null || member.currentHp > 0,
    counter: member.runProgress?.[VEIGAR_COUNTER_KEY] ?? 0,
    cumulativeDamage:
      snapshot.championStats.find((entry) => entry.championId === championId)?.totalDamage ?? 0,
  };
}

function runPairedCohort(
  authority: AuthorityCohortRuntime,
  championId: string,
  seeds: readonly number[],
  difficulty: AuthorityDifficulty,
) {
  const checkpoints = new Map<number, BiomeObservation[]>();
  const maxima = new Map<number, number>();
  const reached = new Map<number, Map<Biome, BiomeObservation>>();
  const observingAuthority: AuthorityCohortRuntime = {
    engineVersion: authority.engineVersion,
    contentHash: authority.contentHash,
    verify: authority.verify.bind(authority),
    createSession(attempt) {
      const session = authority.createSession(attempt);
      checkpoints.set(attempt.seed, []);
      reached.set(attempt.seed, new Map());
      const initial = session.getResult().snapshot;
      if (initial.currentBiome)
        reached.get(attempt.seed)?.set(initial.currentBiome, {
          seed: attempt.seed,
          biome: initial.currentBiome,
          ...snapshotMage(initial, championId),
        });
      return {
        getResult: session.getResult.bind(session),
        append(command) {
          const before = session.getResult().snapshot;
          session.append(command);
          const after = session.getResult().snapshot;
          const mage = snapshotMage(after, championId);
          maxima.set(attempt.seed, Math.max(maxima.get(attempt.seed) ?? 0, mage.counter));
          if (
            before.currentBiome &&
            (after.currentBiomeIndex > before.currentBiomeIndex || after.won)
          ) {
            checkpoints
              .get(attempt.seed)
              ?.push({ seed: attempt.seed, biome: before.currentBiome, ...mage });
            reached.get(attempt.seed)?.set(before.currentBiome, {
              seed: attempt.seed,
              biome: before.currentBiome,
              ...mage,
            });
          }
          if (after.currentBiome)
            reached.get(attempt.seed)?.set(after.currentBiome, {
              seed: attempt.seed,
              biome: after.currentBiome,
              ...mage,
            });
        },
      };
    },
  };
  const scenario = createVeigarBalanceScenario(championId, difficulty);
  const cohort = simulateAuthorityCohort({
    authority: observingAuthority,
    policy: survivalGreedyPolicy,
    scenario,
    seeds,
  });
  const observations = cohort.runs.map((run): VeigarBalanceRunObservation => {
    const final = run.result.snapshot;
    return {
      seed: run.seed,
      won: final.won,
      endBiome: final.currentBiome,
      endReason: final.endReason,
      totalDamage: snapshotMage(final, championId).cumulativeDamage,
      teamDamage: final.totalDamage,
      combatWins: run.result.combatSummaries.filter((combat) => combat.winner === 'player').length,
      combatCount: run.result.combatSummaries.length,
      finalCounter: snapshotMage(final, championId).counter,
      maxCounter: maxima.get(run.seed) ?? 0,
      finalTeamSize: final.team.length,
      checkpoints: checkpoints.get(run.seed) ?? [],
      reachedSnapshots: [...(reached.get(run.seed)?.values() ?? [])],
      reproductionCommand: createBalanceReproductionCommand(scenario, run.seed, authority),
    };
  });
  return { observations, runs: cohort.runs };
}

export interface VeigarBalanceBattleClasses {
  ChampionInstance: typeof ChampionInstance;
  BattleManager: typeof BattleManager;
  championDB: { getById(id: string): Champion | undefined };
}

function requiredChampion(classes: VeigarBalanceBattleClasses, id: string): Champion {
  const definition = classes.championDB.getById(id);
  if (!definition) throw new Error(`Missing balance champion ${id}.`);
  return definition;
}

function simulateZeroStackBattle(classes: VeigarBalanceBattleClasses, id: string, seed: number) {
  const mage = new classes.ChampionInstance(requiredChampion(classes, id), 5);
  const initialCounter = mage.getRunCounter(VEIGAR_COUNTER_KEY);
  const opponent = new classes.ChampionInstance(requiredChampion(classes, 'Garen'), 5);
  const battle = new classes.BattleManager(
    { side: 'player', champions: [mage] },
    { side: 'enemy', champions: [opponent] },
    { autoActions: true, maxRounds: 40, random: createChampionCombatMatrixRandom(seed) },
  );
  battle.startBattle();
  for (let turn = 0; battle.phase !== BattlePhase.Finished && turn < 1000; turn++)
    battle.processCurrentTurn();
  const result = battle.getResult();
  if (!result) throw new Error('Zero-stack battle did not finish.');
  return {
    championId: id,
    seed,
    level: 5,
    initialCounter,
    winner: result.winner,
    rounds: result.totalRounds,
    damage:
      result.metrics.bySide.player.hpDamageDealt + result.metrics.bySide.player.shieldDamageDealt,
    finalCounter: mage.getRunCounter(VEIGAR_COUNTER_KEY),
  };
}

function probeUltimate(
  classes: VeigarBalanceBattleClasses,
  restoredCounter: number,
  hpRatio: number,
) {
  const mage = new classes.ChampionInstance(
    requiredChampion(classes, 'Veigar'),
    18,
    1,
    {},
    { [VEIGAR_COUNTER_KEY]: restoredCounter },
  );
  const targetBase = requiredChampion(classes, 'Garen');
  const target = new classes.ChampionInstance({
    ...targetBase,
    id: 'BalanceTarget',
    stats: {
      ...targetBase.stats,
      hp: 1_000_000,
      hpPerLevel: 0,
      hpRegen: 0,
      hpRegenPerLevel: 0,
      armor: 0,
      armorPerLevel: 0,
      magicResist: 0,
      magicResistPerLevel: 0,
      moveSpeed: 1,
      attackDamage: 0,
    },
    passive: { ...targetBase.passive, effects: [], runProgression: undefined },
    spells: targetBase.spells.map((spell) => ({
      ...spell,
      effects: [{ type: 'damage', damageType: 'true', baseDamage: [0] }],
    })),
  });
  const battle = new classes.BattleManager(
    { side: 'player', champions: [mage] },
    { side: 'enemy', champions: [target] },
    { autoActions: false, random: () => 0.99, maxRounds: 10 },
  );
  battle.startBattle();
  for (
    let turn = 0;
    (battle.round < 5 || battle.currentCombatant?.side !== 'player') && turn < 100;
    turn++
  ) {
    if (battle.currentCombatant?.side === 'player') {
      if (!battle.submitAction({ type: ActionType.BasicAttack, targetId: 'BalanceTarget' }))
        throw new Error('Probe warm-up rejected.');
    } else battle.processCurrentTurn();
  }
  const state = battle.getEnemyCombatants()[0];
  state.currentHp = state.maxHp * hpRatio;
  const logIndex = battle.log.length;
  if (!battle.submitAction({ type: ActionType.SpellR, targetId: state.targetId }))
    throw new Error('Ultimate probe rejected.');
  const damage = battle.log
    .slice(logIndex)
    .find((event) => event.type === 'damage' && event.sourceSide === 'player');
  if (damage?.type !== 'damage') throw new Error('Ultimate produced no damage event.');
  return {
    restoredCounter,
    hpRatio,
    counter: mage.getRunCounter(VEIGAR_COUNTER_KEY),
    abilityPower: mage.getStats().abilityPower,
    rawDamage: damage.amount + (damage.overkillDamage ?? 0),
  };
}

export function createVeigarBalanceCombatProbes(
  classes: VeigarBalanceBattleClasses,
  seeds: readonly number[],
) {
  return {
    zeroStackCombats: VEIGAR_BALANCE_CHAMPIONS.flatMap((id) =>
      seeds.map((seed) => simulateZeroStackBattle(classes, id, seed)),
    ),
    ultimate: [0, 200, 999].flatMap((counter) =>
      [1, 0.5, 0.001].map((hpRatio) => probeUltimate(classes, counter, hpRatio)),
    ),
  };
}

/** Stop after the actual first seeded Top encounter, then independently replay that legal prefix. */
function probeEarlyTopCombat(authority: AuthorityCohortRuntime, championId: string, seed: number) {
  const scenario = {
    ...createVeigarBalanceScenario(championId),
    id: `veigar-v22-solo-${championId.toLowerCase()}-top-probe`,
    team: [{ championId }],
  };
  const attempt = survivalGreedyPolicy.buildAttempt({ scenario, seed });
  const session = authority.createSession(attempt);
  const trace = [];
  for (
    let commandIndex = 0;
    session.getResult().combatSummaries.length === 0 && commandIndex < 100;
    commandIndex++
  ) {
    const next = survivalGreedyPolicy.nextCommand(session.getResult().snapshot);
    if (!next) throw new Error('Early Top policy stopped before first combat.');
    trace.push(next);
    session.append(next);
  }
  const result = session.getResult();
  const verification = authority.verify(attempt, trace, { requireTerminal: false });
  if (!verification.ok || JSON.stringify(result) !== JSON.stringify(verification.result)) {
    throw new Error('Early Top prefix verification diverged.');
  }
  const first = result.combatSummaries[0];
  if (
    !first ||
    first.biome !== 'top_lane' ||
    first.playerTeam.initial.length !== 1 ||
    first.runLevel !== 1
  ) {
    throw new Error('Early Top probe must be the actual fresh solo level-1 encounter.');
  }
  return {
    result,
    observation: {
      championId,
      seed,
      encounterId: first.encounterId,
      nodeType: first.nodeType,
      level: first.runLevel,
      winner: first.winner,
      rounds: first.rounds,
      initialCounter: first.playerTeam.initial[0].runProgress?.[VEIGAR_COUNTER_KEY] ?? 0,
      finalCounter: first.playerTeam.final[0].runProgress?.[VEIGAR_COUNTER_KEY] ?? 0,
      damage: result.snapshot.totalDamage,
      enemyInitialResources: first.enemyTeam.initial.map(({ championId, maxHp, maxMp }) => ({
        championId,
        maxHp,
        maxMp,
      })),
    },
  };
}

export function generateVeigarRunProgressionBalanceDocument(input: {
  sourceAuthority: AuthorityCohortRuntime;
  edgeAuthority: AuthorityCohortRuntime;
  sourceClasses: VeigarBalanceBattleClasses;
  edgeClasses: VeigarBalanceBattleClasses;
  seeds?: readonly number[];
}) {
  const seeds = input.seeds ?? VEIGAR_BALANCE_SEEDS;
  if (
    input.sourceAuthority.engineVersion !== 'run-engine-v22' ||
    input.edgeAuthority.engineVersion !== input.sourceAuthority.engineVersion ||
    input.edgeAuthority.contentHash !== input.sourceAuthority.contentHash
  )
    throw new Error('Expected matching current v22 source/Edge identities.');
  const reports = (['normal', 'easy'] as const).flatMap((difficulty) =>
    VEIGAR_BALANCE_CHAMPIONS.map((championId) => {
      const sourceCohort = runPairedCohort(input.sourceAuthority, championId, seeds, difficulty);
      const edgeCohort = runPairedCohort(input.edgeAuthority, championId, seeds, difficulty);
      if (JSON.stringify(sourceCohort) !== JSON.stringify(edgeCohort))
        throw new Error(`Source/Edge cohort divergence for ${championId}.`);
      const sourceRuns = sourceCohort.observations;
      return {
        championId,
        difficulty,
        ...summarizeVeigarBalanceRuns(sourceRuns),
        observations: sourceRuns,
      };
    }),
  );
  const earlyTopProbes = VEIGAR_BALANCE_CHAMPIONS.flatMap((championId) =>
    seeds.map((seed) => {
      const source = probeEarlyTopCombat(input.sourceAuthority, championId, seed);
      const edge = probeEarlyTopCombat(input.edgeAuthority, championId, seed);
      if (JSON.stringify(source) !== JSON.stringify(edge))
        throw new Error('Source/Edge early Top probe divergence.');
      return source.observation;
    }),
  );
  const earlyTopReports = VEIGAR_BALANCE_CHAMPIONS.map((championId) => {
    const probes = earlyTopProbes.filter((entry) => entry.championId === championId);
    return {
      championId,
      battles: probes.length,
      wins: probes.filter((entry) => entry.winner === 'player').length,
      damageMean: mean(probes.map((entry) => entry.damage)),
      finalCounterMean: mean(probes.map((entry) => entry.finalCounter)),
    };
  });
  const probes = createVeigarBalanceCombatProbes(input.sourceClasses, seeds);
  const edgeProbes = createVeigarBalanceCombatProbes(input.edgeClasses, seeds);
  if (JSON.stringify(probes) !== JSON.stringify(edgeProbes))
    throw new Error('Source/Edge combat probe divergence.');
  const zeroStackReports = VEIGAR_BALANCE_CHAMPIONS.map((championId) => {
    const battles = probes.zeroStackCombats.filter((entry) => entry.championId === championId);
    return {
      championId,
      battles: battles.length,
      wins: battles.filter((entry) => entry.winner === 'player').length,
      damageMean: mean(battles.map((entry) => entry.damage)),
      roundsMean: mean(battles.map((entry) => entry.rounds)),
    };
  });
  const baseline = probes.ultimate.find(
    (entry) => entry.restoredCounter === 0 && entry.hpRatio === 1,
  )!;
  const capped = probes.ultimate.find(
    (entry) => entry.restoredCounter === 200 && entry.hpRatio === 1,
  )!;
  const gates = {
    sourceEdgeParity: true,
    earlyTopStartsAtZeroStacks: earlyTopProbes.every((probe) => probe.initialCounter === 0),
    counterNeverAbove200: reports.every((report) => report.maxCounterObserved <= 200),
    cappedAbilityPowerBonusExactly200: capped.abilityPower - baseline.abilityPower === 200,
    overflowRestorationMatchesCap: probes.ultimate
      .filter((entry) => entry.restoredCounter === 999)
      .every(
        (entry) =>
          entry.rawDamage ===
          probes.ultimate.find(
            (cappedEntry) =>
              cappedEntry.restoredCounter === 200 && cappedEntry.hpRatio === entry.hpRatio,
          )?.rawDamage,
      ),
    ultimateNeverAboveDoubleDamage: probes.ultimate.every((entry) => {
      const full = probes.ultimate.find(
        (other) => other.restoredCounter === entry.restoredCounter && other.hpRatio === 1,
      )!;
      return entry.rawDamage <= full.rawDamage * 2 + 1;
    }),
  };
  const comparisons = reports
    .filter((report) => report.championId !== 'Veigar')
    .map((report) => {
      const veigar = reports.find(
        (candidate) =>
          candidate.difficulty === report.difficulty && candidate.championId === 'Veigar',
      )!;
      const veigarRuns = veigar.observations;
      return {
        championId: report.championId,
        difficulty: report.difficulty,
        pairedRuns: seeds.length,
        runWinDifference: veigar.runWinRate! - report.runWinRate!,
        mageDamageDifferenceMean: mean(
          veigarRuns.map((run, index) => run.totalDamage - report.observations[index].totalDamage),
        ),
        mageDamageRatioOfMeans: report.mageDamageMeanAllRuns
          ? veigar.mageDamageMeanAllRuns! / report.mageDamageMeanAllRuns
          : null,
      };
    });
  if (Object.values(gates).some((passed) => !passed))
    throw new Error('Veigar progression safety or parity gate failed.');
  return {
    schemaVersion: 1,
    authority: {
      engineVersion: input.sourceAuthority.engineVersion,
      contentHash: input.sourceAuthority.contentHash,
    },
    methodology: {
      kind: 'paired-veigar-run-progression',
      evidence: 'automated bot campaign, not human playtest validation',
      seeds,
      runsPerChampion: seeds.length,
      championIds: VEIGAR_BALANCE_CHAMPIONS,
      teammate: 'Garen',
      difficulties: ['normal', 'easy'],
      masterySnapshot: {},
      enhancementSnapshot: {},
      runeIds: [],
      policy: survivalGreedyPolicy.manifest,
      recruitment: 'unchanged survival-greedy policy; teams may diverge after recruitment',
      checkpointPopulation:
        'reached = last authoritative snapshot in biome; completed = transition or final win; survivors = completed and focal champion alive; unreached means null, never zero',
      apMetric: 'permanent bonus from the run counter only, excluding level/items/augments',
      verification:
        'each run incrementally simulated and terminally verified in source and exact current Edge bundle',
      probes:
        '30 paired real solo level-1 opening Top encounters, 30 level-5 solo combats versus Garen from zero stacks; rank-1 R at level18 versus neutral zero-defense target, counters0/200/999',
    },
    gates,
    comparisons,
    reports,
    zeroStackReports,
    earlyTopReports,
    earlyTopProbes,
    combatProbes: probes,
  };
}
