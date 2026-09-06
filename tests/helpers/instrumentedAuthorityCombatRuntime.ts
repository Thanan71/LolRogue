import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type ChampionCombatMatrixEvent,
  type ChampionCombatMatrixRuntime,
  createChampionCombatMatrixRandom,
} from '@/game/balance/championCombatMatrix';

const MAX_COMBAT_STEPS = 100_000;
const FINAL_EXPORT_PATTERN = /export\{([^{}]*)\};?\s*$/;

interface InstrumentedBattle {
  readonly phase: string;
  readonly log: readonly ChampionCombatMatrixEvent[];
  startBattle(): void;
  processCurrentTurn(): void;
  getResult(): {
    readonly winner: 'player' | 'enemy' | 'draw';
    readonly totalRounds: number;
  } | null;
}

interface InstrumentedAuthorityModule {
  readonly AUTHORITY_ENGINE_VERSION: string;
  readonly AUTHORITY_CONTENT_HASH: string;
  readonly championDB: { getById(championId: string): unknown };
  readonly ChampionInstance: new (champion: unknown, level: number) => unknown;
  readonly BattleManager: new (
    playerTeam: { readonly side: 'player'; readonly champions: readonly unknown[] },
    enemyTeam: { readonly side: 'enemy'; readonly champions: readonly unknown[] },
    options: {
      readonly autoActions: boolean;
      readonly maxRounds: number;
      readonly random: () => number;
    },
  ) => InstrumentedBattle;
}

/**
 * Adds test-only exports in a temporary copy. The committed authority archive stays
 * byte-identical while the exact classes embedded in that archive run the matrix.
 */
async function importInstrumentedAuthorityBundle(
  bundlePath: string,
): Promise<InstrumentedAuthorityModule> {
  const source = await readFile(bundlePath, 'utf8');
  const instrumented = source.replace(
    FINAL_EXPORT_PATTERN,
    'export{$1,BattleManager,ChampionInstance,championDB};',
  );
  if (instrumented === source) {
    throw new Error(`Authority bundle "${bundlePath}" has no instrumentable final export.`);
  }
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-combat-matrix-'));
  const temporaryBundle = path.join(temporaryRoot, 'authority-combat-runtime.mjs');
  try {
    await writeFile(temporaryBundle, instrumented, 'utf8');
    return (await import(pathToFileURL(temporaryBundle).href)) as InstrumentedAuthorityModule;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function loadInstrumentedAuthorityCombatRuntime(
  bundlePath: string,
): Promise<ChampionCombatMatrixRuntime> {
  const authority = await importInstrumentedAuthorityBundle(bundlePath);
  return {
    engineVersion: authority.AUTHORITY_ENGINE_VERSION,
    contentHash: authority.AUTHORITY_CONTENT_HASH,
    simulateBattle(input) {
      const createTeam = <TSide extends 'player' | 'enemy'>(
        side: TSide,
        championIds: readonly string[],
      ): { readonly side: TSide; readonly champions: readonly unknown[] } => ({
        side,
        champions: championIds.map((championId) => {
          const champion = authority.championDB.getById(championId);
          if (!champion) throw new Error(`Unknown champion "${championId}" in combat matrix.`);
          return new authority.ChampionInstance(champion, input.level);
        }),
      });
      const battle = new authority.BattleManager(
        createTeam('player', input.playerChampionIds),
        createTeam('enemy', input.enemyChampionIds),
        {
          autoActions: true,
          maxRounds: input.maxRounds,
          random: createChampionCombatMatrixRandom(input.randomSeed),
        },
      );
      battle.startBattle();
      let steps = 0;
      while (battle.phase !== 'finished' && steps < MAX_COMBAT_STEPS) {
        battle.processCurrentTurn();
        steps++;
      }
      const result = battle.getResult();
      if (!result || battle.phase !== 'finished') {
        throw new Error(
          `Combat matrix exceeded ${MAX_COMBAT_STEPS} steps for seed ${input.randomSeed}.`,
        );
      }
      return { winner: result.winner, rounds: result.totalRounds, events: battle.log };
    },
  };
}
