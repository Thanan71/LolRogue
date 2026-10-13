import { type CombatActionTrace, decodeCombatActionTrace } from '../battle/actionTrace';
import type { BattleManager } from '../battle/BattleManager';
import { BattlePhase, type CombatantState } from '../battle/types';
import { failAuthorityVerification as fail } from './RunCommandValidator';
import type { AuthorityCombatantResources } from './types';

/** Owns compact trace consumption; never creates a second RNG or mutates run progression. */
export class DeterministicCombatReplay {
  readonly usesCanonicalAutoPlay: boolean;
  private readonly scriptedActions: CombatActionTrace;
  constructor(
    actionsJson: string,
    private readonly commandIndex: number,
  ) {
    this.usesCanonicalAutoPlay = actionsJson === 'auto';
    const scriptedActions = this.usesCanonicalAutoPlay ? [] : decodeCombatActionTrace(actionsJson);
    if (!scriptedActions)
      fail('invalid_combat_action_trace', 'Combat action trace is malformed.', commandIndex);
    this.scriptedActions = scriptedActions;
  }

  run(
    battle: BattleManager,
    captureResources: (combatants: CombatantState[]) => AuthorityCombatantResources[],
    maxCombatTurns = 100_000,
  ) {
    const commandIndex = this.commandIndex;
    let scriptedActionIndex = 0;
    if (!this.usesCanonicalAutoPlay) {
      battle.setActionCallback(() => {
        const replayedActionCount = battle.getPlayerActionTrace().length;
        while (
          scriptedActionIndex < replayedActionCount &&
          this.scriptedActions[scriptedActionIndex]?.automatic
        ) {
          scriptedActionIndex++;
        }
        const action = this.scriptedActions[scriptedActionIndex];
        // A legal turn may produce no action (for example while rooted with
        // every spell unavailable). Such a turn is intentionally absent from
        // the compact trace, so reaching its end must not consume a phantom
        // entry and invalidate an otherwise exact replay.
        if (!action) return null;
        if (action.automatic) return null;
        scriptedActionIndex++;
        return action;
      });
    }
    battle.startBattle();
    const initialPlayerResources = captureResources(battle.getPlayerCombatants());
    const initialEnemyResources = captureResources(battle.getEnemyCombatants());
    let processedTurns = 0;
    while (battle.phase !== BattlePhase.Finished && processedTurns < maxCombatTurns) {
      battle.processCurrentTurn();
      processedTurns++;
    }
    if (battle.phase !== BattlePhase.Finished) {
      fail('combat_limit', 'Combat exceeded the deterministic safety limit.', commandIndex);
    }
    const result = battle.getResult();
    if (!result) fail('invalid_combat_result', 'Combat ended without a result.', commandIndex);
    const replayedActions = battle.getPlayerActionTrace();
    const firstMismatchedActionIndex = replayedActions.findIndex(
      (action, index) =>
        action.type !== this.scriptedActions[index]?.type ||
        action.targetId !== this.scriptedActions[index]?.targetId ||
        action.automatic !== this.scriptedActions[index]?.automatic,
    );
    const unconsumedActions = this.scriptedActions.slice(replayedActions.length);
    const hasValidReplayPrefix =
      replayedActions.length <= this.scriptedActions.length && firstMismatchedActionIndex === -1;
    const hasOnlyHarmlessAutomaticSuffix = unconsumedActions.every((action) => action.automatic);
    if (!this.usesCanonicalAutoPlay && (!hasValidReplayPrefix || !hasOnlyHarmlessAutomaticSuffix)) {
      const mismatchIndex =
        firstMismatchedActionIndex !== -1 ? firstMismatchedActionIndex : replayedActions.length;
      fail(
        'invalid_combat_action_trace',
        `Combat action trace does not match deterministic replay at action ${mismatchIndex + 1} ` +
          `(received ${JSON.stringify(this.scriptedActions[mismatchIndex] ?? null)}, ` +
          `replayed ${JSON.stringify(replayedActions[mismatchIndex] ?? null)}).`,
        commandIndex,
      );
    }
    return { result, initialPlayerResources, initialEnemyResources };
  }
}
