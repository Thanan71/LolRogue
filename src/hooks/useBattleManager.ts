import { useCallback, useEffect, useRef } from 'react';
import { BattleManager } from '@/game/battle/BattleManager';
import { isActionTargeting } from '@/game/battle/targetResolver';
import type { BattleAction, BattleEvent, BattleTeam } from '@/game/battle/types';
import { BattlePhase } from '@/game/battle/types';
import type { ChampionInstance } from '@/game/ChampionInstance';
import { runStatsTracker } from '@/services/RunStatsTracker';
import { type CombatantInfo, type SpellInfo, useBattleStore } from '@/stores/battleStore';
import type { FinalCombatantState } from '@/types/run';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Convert a ChampionInstance + combatant state to CombatantInfo for the UI */
function toCombatantInfo(
  champ: ChampionInstance,
  targetId: string,
  side: 'player' | 'enemy',
  currentHp: number,
  maxHp: number,
  currentMp: number,
  isDefeated: boolean,
): CombatantInfo {
  const stats = champ.getStats();
  const slots: Array<'Q' | 'W' | 'E' | 'R'> = ['Q', 'W', 'E', 'R'];
  const spells: SpellInfo[] = [];
  for (const slot of slots) {
    const spell = champ.getSpell(slot);
    if (spell && isActionTargeting(spell.targeting)) {
      const rank = champ.getSpellRank(slot);
      const cost = spell.cost[rank - 1] ?? spell.cost[spell.cost.length - 1] ?? 0;
      spells.push({
        slot,
        name: spell.name,
        cooldownMax: champ.getMaxCooldown(slot),
        cooldownCurrent: champ.getCooldown(slot),
        cost,
        isReady: champ.isSpellReady(slot) && currentMp >= cost,
        targeting: spell.targeting,
      });
    }
  }
  return {
    targetId,
    id: champ.id,
    name: champ.name,
    level: champ.level,
    currentHp,
    maxHp,
    currentMp,
    maxMp: stats.mp,
    iconUrl: champ.iconUrl,
    isDefeated,
    side,
    spells,
  };
}

function syncTeams(bm: BattleManager): void {
  const store = useBattleStore.getState();
  const player = bm
    .getPlayerCombatants()
    .map((c) =>
      toCombatantInfo(
        c.champion,
        c.targetId,
        'player',
        c.currentHp,
        c.maxHp,
        c.currentMp,
        c.isDefeated,
      ),
    );
  const enemy = bm
    .getEnemyCombatants()
    .map((c) =>
      toCombatantInfo(
        c.champion,
        c.targetId,
        'enemy',
        c.currentHp,
        c.maxHp,
        c.currentMp,
        c.isDefeated,
      ),
    );
  store.setTeams(player, enemy);
}

function getFinalCombatantStates(bm: BattleManager): FinalCombatantState[] {
  const resources = new Map(
    bm
      .getPlayerCombatants()
      .map((combatant) => [
        combatant.champion.id,
        { currentMp: combatant.currentMp, maxMp: combatant.maxMp },
      ]),
  );

  return bm.getFinalPlayerStates().map((state) => ({
    ...state,
    currentMp: resources.get(state.championId)?.currentMp ?? 0,
    maxMp: resources.get(state.championId)?.maxMp ?? 0,
  }));
}

function getActionLabel(action: string): string {
  if (action === 'basic_attack') return 'Attaque de base';
  if (action === 'spell_q') return 'Sort Q';
  if (action === 'spell_w') return 'Sort W';
  if (action === 'spell_e') return 'Sort E';
  if (action === 'spell_r') return 'Sort R (Ultime)';
  return action;
}

function handleEvent(bm: BattleManager, event: BattleEvent): void {
  const store = useBattleStore.getState();

  switch (event.type) {
    case 'round_start':
      store.setRound(event.round);
      store.setPhase('turn_active');
      store.addLog({ type: 'round_start', message: `=== Round ${event.round} ===` });
      syncTeams(bm);
      break;

    case 'turn_start':
      store.setTurnInfo(event.turnIndex, event.champion, event.side);
      syncTeams(bm);
      break;

    case 'action_select':
      store.addLog({
        type: 'action',
        message: `${event.champion}: ${getActionLabel(event.action)}`,
      });
      break;

    case 'damage':
      syncTeams(bm);
      store.addLog({
        type: 'damage',
        message: `${event.source} → ${event.target}: ${event.amount} dégâts${event.isCrit ? ' CRITIQUE !' : ''}`,
        amount: event.amount,
        isCrit: event.isCrit,
      });
      // Track damage for player champions
      if (event.sourceSide === 'player') {
        runStatsTracker.recordDamage(event.source, event.amount);
      }
      break;

    case 'heal':
      syncTeams(bm);
      store.addLog({
        type: 'heal',
        message: `${event.source} → ${event.target}: +${event.amount} HP`,
        amount: event.amount,
      });
      break;

    case 'shield':
      syncTeams(bm);
      store.addLog({
        type: 'shield',
        message: `${event.source} → ${event.target}: +${event.amount} bouclier`,
        amount: event.amount,
      });
      break;

    case 'defeat':
      syncTeams(bm);
      store.addLog({ type: 'defeat', message: `${event.champion} a été vaincu !` });
      // Track kill: credit the player champion who dealt the killing blow
      if (event.side === 'enemy' && event.defeatedBy) {
        runStatsTracker.recordKill(event.defeatedBy);
      }
      break;

    case 'battle_end':
      syncTeams(bm);
      store.setWinner(event.winner);
      store.addLog({
        type: 'battle_end',
        message:
          event.winner === 'draw'
            ? 'Égalité !'
            : event.winner === 'player'
              ? 'Victoire !'
              : 'Défaite !',
      });
      break;
  }
}

interface UseBattleManagerOptions {
  playerTeam: ChampionInstance[];
  enemyTeam: ChampionInstance[];
  autoPlay?: boolean;
  onComplete?: (
    winner: 'player' | 'enemy' | 'draw',
    finalPlayerStates: FinalCombatantState[],
  ) => void;
  /** Map of championId -> initial HP for persisting HP between combats. */
  initialHpOverrides?: Record<string, number>;
  random?: () => number;
}

export function useBattleManager({
  playerTeam,
  enemyTeam,
  autoPlay = true,
  onComplete,
  initialHpOverrides,
  random,
}: UseBattleManagerOptions) {
  const bmRef = useRef<BattleManager | null>(null);
  const store = useBattleStore();
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const hasCompletedRef = useRef(false);

  /** Lifecycle: BattleManager is recreated whenever playerTeam or enemyTeam
   *  references change. This ensures a new combat gets fresh teams.
   *
   *  onComplete is read via a ref so the latest callback is always invoked
   *  without needing to recreate the effect.
   */
  useEffect(() => {
    // If no player team, don't start a battle
    if (playerTeam.length === 0) return;

    // Reset the battle store and completion flag
    store.resetBattle();
    hasCompletedRef.current = false;

    const playerBTeam: BattleTeam = { side: 'player', champions: playerTeam };
    const enemyBTeam: BattleTeam = { side: 'enemy', champions: enemyTeam };

    const bm = new BattleManager(playerBTeam, enemyBTeam, {
      autoActions: autoPlayRef.current,
      initialHpOverrides,
      random,
    });

    const eventHandler = (e: BattleEvent) => handleEvent(bm, e);
    bm.on('event', eventHandler);

    // Set phase to starting (resetBattle already set it to idle)
    store.setPhase('starting');

    // Sync initial teams
    syncTeams(bm);

    // Start battle after a longer delay to ensure UI is rendered first
    // This prevents the battle from ending before the combat screen is visible
    const timer = setTimeout(() => {
      bm.startBattle();
      syncTeams(bm);
    }, 2000);

    bmRef.current = bm;

    return () => {
      clearTimeout(timer);
      bm.off('event', eventHandler);
      bmRef.current = null;
    };
  }, [playerTeam, enemyTeam, random]);

  // Check for battle completion
  useEffect(() => {
    // Get fresh state from the store (not from closure)
    const currentState = useBattleStore.getState();

    // Skip if we haven't started a battle yet (phase is still idle or just starting)
    if (currentState.phase === 'idle' || currentState.phase === 'starting') return;

    if (
      currentState.phase === 'finished' &&
      currentState.winner &&
      onCompleteRef.current &&
      !hasCompletedRef.current
    ) {
      hasCompletedRef.current = true;
      const winner = currentState.winner;
      // Capture from this BattleManager instance before any route transition can
      // unmount/remount combat and reset the global battle store.
      const manager = bmRef.current;
      const finalPlayerStates = manager ? getFinalCombatantStates(manager) : [];
      onCompleteRef.current(winner, finalPlayerStates);
    }
  }, [store.phase, store.winner]);

  const processTurn = useCallback(() => {
    const bm = bmRef.current;
    if (!bm || bm.phase !== BattlePhase.TurnActive) return;
    bm.processCurrentTurn();
    syncTeams(bm);
  }, []);

  const submitAction = useCallback((action: BattleAction) => {
    const bm = bmRef.current;
    if (!bm) return false;
    const result = bm.submitAction(action);
    if (result) syncTeams(bm);
    return result;
  }, []);

  const getAvailableActions = useCallback(() => {
    const bm = bmRef.current;
    if (!bm) return [];
    const entry = bm.currentTurnEntry;
    if (!entry) return [];
    return bm.getAvailableActions(entry.champion);
  }, []);

  return {
    processTurn,
    submitAction,
    getAvailableActions,
    /** Get final HP and mana state for player champions after battle. */
    getFinalPlayerStates: () => {
      const bm = bmRef.current;
      if (!bm) return [];
      return getFinalCombatantStates(bm);
    },
    /** Safe accessor — returns current BattleManager or null. Always call this
     *  inside event handlers/callbacks; never store the value in a local var
     *  that outlives the current synchronous execution. */
    getManager: () => bmRef.current,
  };
}
