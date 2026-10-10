import type { BattleManager } from '@/game/battle/BattleManager';

/**
 * Advance a forced turn in a manager owned by the manual UI. The published
 * engine falls back to AI when a callback returns null. If CC protection
 * restores a legal command mid-turn, stop at its public decision callback
 * instead; the hook then syncs the cleared effects and waits for confirmation.
 * The sentinel is synchronous, caught here, and never reaches error reporting.
 */
export function advanceManualBlockedTurn(manager: BattleManager): void {
  const entry = manager.currentTurnEntry;
  if (!entry || entry.side !== 'player' || manager.getAvailableActions(entry.champion).length > 0)
    return;
  const decisionReady = Symbol('manual-decision-ready');
  manager.setActionCallback((champion) => {
    if (manager.getAvailableActions(champion).length > 0) throw decisionReady;
    return null;
  });
  try {
    manager.processCurrentTurn();
  } catch (error) {
    if (error !== decisionReady) throw error;
  } finally {
    // The UI submits confirmed commands directly, so its ordinary automatic
    // turns use the engine's neutral callback / existing AI fallback.
    manager.setActionCallback(() => null);
  }
}
