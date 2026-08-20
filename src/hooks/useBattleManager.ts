import { useCallback, useEffect, useRef } from 'react';
import { riotSpellIconUrl } from '@/config/riotSpellAssets';
import type { CombatActionTrace } from '@/game/battle/actionTrace';
import { BattleManager } from '@/game/battle/BattleManager';
import { isSpellCombatReady } from '@/game/battle/combatContentSupport';
import { isActionTargeting } from '@/game/battle/targetResolver';
import type { BattleAction, BattleEvent, BattleTeam, TeamSide } from '@/game/battle/types';
import { ActionType as BattleActionType, BattlePhase } from '@/game/battle/types';
import type { ChampionInstance } from '@/game/ChampionInstance';
import { buildSpellImpactPreview } from '@/game/presentation/spellPreview';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import type { CombatRuleLoadout } from '@/game/rules/types';
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
  maxMp: number,
  isDefeated: boolean,
): CombatantInfo {
  const slots: Array<'Q' | 'W' | 'E' | 'R'> = ['Q', 'W', 'E', 'R'];
  const spells: SpellInfo[] = [];
  for (const slot of slots) {
    const spell = champ.getSpell(slot);
    if (
      spell &&
      isActionTargeting(spell.targeting) &&
      isSpellCombatReady(spell, champ.getSpellRank(slot))
    ) {
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
        iconUrl: riotSpellIconUrl(champ.id, spell.image),
        impacts: buildSpellImpactPreview(spell, rank, champ.getEnhancedStats()),
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
    maxMp,
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
        c.maxMp,
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
        c.maxMp,
        c.isDefeated,
      ),
    );
  store.setTeams(player, enemy);
}

function getFinalCombatantStates(bm: BattleManager): FinalCombatantState[] {
  return bm.getFinalPlayerStates();
}

function getActionLabel(action: string): string {
  if (action === 'basic_attack') return 'Attaque de base';
  if (action === 'spell_q') return 'Sort Q';
  if (action === 'spell_w') return 'Sort W';
  if (action === 'spell_e') return 'Sort E';
  if (action === 'spell_r') return 'Sort R (Ultime)';
  return action;
}

function getCrowdControlLabel(type: string): string {
  switch (type) {
    case 'stun':
      return 'étourdissement';
    case 'snare':
      return 'immobilisation';
    case 'silence':
      return 'silence';
    case 'slow':
      return 'ralentissement';
    case 'knockup':
      return 'projection';
    case 'fear':
      return 'peur';
    case 'charm':
      return 'charme';
    default:
      return type;
  }
}

function actionForEffectEvent(
  event: { source: string; sourceCombatantId?: string; sourceSide: TeamSide },
  fallback: BattleActionType,
): BattleActionType {
  const current = useBattleStore.getState().visualEvent;
  if (!current || current.sourceSide !== event.sourceSide || current.sourceId !== event.source) {
    return fallback;
  }
  if (
    current.sourceCombatantId &&
    event.sourceCombatantId &&
    current.sourceCombatantId !== event.sourceCombatantId
  ) {
    return fallback;
  }
  return current.action;
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
      store.showVisualEvent({
        kind: 'cast',
        action: event.action,
        sourceId: event.champion,
        sourceCombatantId: bm.currentCombatant?.targetId,
        sourceSide: event.side,
      });
      store.addLog({
        type: 'action',
        message: `${event.champion}: ${getActionLabel(event.action)}`,
      });
      break;

    case 'crowd_control_applied':
      syncTeams(bm);
      store.addLog({
        type: 'crowd_control',
        message: `${event.source} → ${event.target}: ${getCrowdControlLabel(event.ccType)} (${event.duration} ${event.duration === 1 ? 'tour' : 'tours'})`,
      });
      break;

    case 'turn_skipped':
      syncTeams(bm);
      store.addLog({
        type: 'turn_skipped',
        message: `${event.champion} perd son action (${event.crowdControlTypes.map(getCrowdControlLabel).join(', ')})`,
      });
      break;

    case 'damage':
      syncTeams(bm);
      store.showVisualEvent({
        kind: 'damage',
        action: actionForEffectEvent(event, BattleActionType.BasicAttack),
        sourceId: event.source,
        sourceCombatantId: event.sourceCombatantId,
        sourceSide: event.sourceSide,
        targetId: event.target,
        targetCombatantId: event.targetCombatantId,
        targetSide: event.targetSide,
        amount: event.amount,
        isCrit: event.isCrit,
      });
      store.addLog({
        type: 'damage',
        message: `${event.source} → ${event.target}: ${event.amount} dégâts${event.isCrit ? ' CRITIQUE !' : ''}`,
        amount: event.amount,
        isCrit: event.isCrit,
      });
      break;

    case 'heal':
      syncTeams(bm);
      store.showVisualEvent({
        kind: 'heal',
        action: actionForEffectEvent(event, BattleActionType.SpellW),
        sourceId: event.source,
        sourceCombatantId: event.sourceCombatantId,
        sourceSide: event.sourceSide,
        targetId: event.target,
        targetCombatantId: event.targetCombatantId,
        targetSide: event.targetSide,
        amount: event.amount,
      });
      store.addLog({
        type: 'heal',
        message: `${event.source} → ${event.target}: +${event.amount} HP`,
        amount: event.amount,
      });
      break;

    case 'shield':
      syncTeams(bm);
      store.showVisualEvent({
        kind: 'shield',
        action: actionForEffectEvent(event, BattleActionType.SpellW),
        sourceId: event.source,
        sourceCombatantId: event.sourceCombatantId,
        sourceSide: event.sourceSide,
        targetId: event.target,
        targetCombatantId: event.targetCombatantId,
        targetSide: event.targetSide,
        amount: event.amount,
      });
      store.addLog({
        type: 'shield',
        message: `${event.source} → ${event.target}: +${event.amount} bouclier`,
        amount: event.amount,
      });
      break;

    case 'revive':
      syncTeams(bm);
      store.showVisualEvent({
        kind: 'revive',
        action: actionForEffectEvent(event, BattleActionType.SpellR),
        sourceId: event.source,
        sourceSide: event.sourceSide,
        targetId: event.target,
        targetSide: event.targetSide,
        amount: event.amount,
      });
      store.addLog({
        type: 'revive',
        message: `${event.source} ranime ${event.target} avec ${event.amount} PV`,
        amount: event.amount,
      });
      break;

    case 'defeat':
      syncTeams(bm);
      store.addLog({ type: 'defeat', message: `${event.champion} a été vaincu !` });
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
    consumedItemInstanceIds: string[],
    runeStacks: Record<string, Record<string, number>>,
    playerActionTrace: CombatActionTrace,
    combatEvents: BattleEvent[],
  ) => void;
  /** Map of championId -> initial HP for persisting HP between combats. */
  initialHpOverrides?: Record<string, number>;
  /** Map of championId -> initial MP for persisting mana between combats. */
  initialMpOverrides?: Record<string, number>;
  random?: () => number;
  ruleLoadout?: CombatRuleLoadout;
}

export function useBattleManager({
  playerTeam,
  enemyTeam,
  autoPlay = false,
  onComplete,
  initialHpOverrides,
  initialMpOverrides,
  random,
  ruleLoadout,
}: UseBattleManagerOptions) {
  const bmRef = useRef<BattleManager | null>(null);
  const phase = useBattleStore((state) => state.phase);
  const winner = useBattleStore((state) => state.winner);
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
    const store = useBattleStore.getState();
    store.resetBattle();
    hasCompletedRef.current = false;

    const playerBTeam: BattleTeam = { side: 'player', champions: playerTeam };
    const enemyBTeam: BattleTeam = { side: 'enemy', champions: enemyTeam };

    const bm = new BattleManager(playerBTeam, enemyBTeam, {
      autoActions: autoPlayRef.current,
      initialHpOverrides,
      initialMpOverrides,
      random,
      rules: ruleLoadout ? new CombatRuleRuntime(ruleLoadout, random) : undefined,
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
  }, [playerTeam, enemyTeam, initialHpOverrides, initialMpOverrides, random, ruleLoadout]);

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
      onCompleteRef.current(
        winner,
        finalPlayerStates,
        manager?.getConsumedItemInstanceIds() ?? [],
        manager?.getRuneStacks() ?? {},
        manager?.getPlayerActionTrace() ?? [],
        manager?.getResult()?.log ?? [],
      );
    }
  }, [phase, winner]);

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
