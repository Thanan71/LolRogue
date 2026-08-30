import { championDB } from '@/data/championDatabase';
import { AUTHORITY_CONTENT_HASH, AUTHORITY_ENGINE_VERSION } from '@/game/authority';
import { BattleManager } from '@/game/battle/BattleManager';
import { BattlePhase, type BattleTeam } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import {
  type ChampionCombatMatrixEvent,
  type ChampionCombatMatrixRuntime,
  createChampionCombatMatrixRandom,
} from './championCombatMatrix';

const MAX_COMBAT_STEPS = 100_000;

/** Runs the acceptance matrix against the current, unbundled authority source. */
export function createSourceChampionCombatRuntime(): ChampionCombatMatrixRuntime {
  return {
    engineVersion: AUTHORITY_ENGINE_VERSION,
    contentHash: AUTHORITY_CONTENT_HASH,
    simulateBattle(input) {
      const createTeam = (
        side: BattleTeam['side'],
        championIds: readonly string[],
      ): BattleTeam => ({
        side,
        champions: championIds.map((championId) => {
          const champion = championDB.getById(championId);
          if (!champion) throw new Error(`Unknown champion "${championId}" in combat matrix.`);
          return new ChampionInstance(champion, input.level);
        }),
      });
      const battle = new BattleManager(
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
      while (battle.phase !== BattlePhase.Finished && steps < MAX_COMBAT_STEPS) {
        battle.processCurrentTurn();
        steps++;
      }
      const result = battle.getResult();
      if (!result || battle.phase !== BattlePhase.Finished) {
        throw new Error(
          `Combat matrix exceeded ${MAX_COMBAT_STEPS} steps for seed ${input.randomSeed}.`,
        );
      }
      return {
        winner: result.winner,
        rounds: result.totalRounds,
        events: battle.log as readonly ChampionCombatMatrixEvent[],
      };
    },
  };
}
