import { create } from 'zustand';
import type { ActionTargeting, ActionType, TeamSide } from '@/game/battle/types';

export interface SpellInfo {
  slot: 'Q' | 'W' | 'E' | 'R';
  name: string;
  cooldownMax: number;
  cooldownCurrent: number;
  cost: number;
  isReady: boolean;
  targeting: ActionTargeting;
  iconUrl?: string;
}

export interface CombatantInfo {
  targetId: string;
  id: string;
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  iconUrl: string;
  isDefeated: boolean;
  side: 'player' | 'enemy';
  spells: SpellInfo[];
}

export interface LogEntry {
  id: number;
  timestamp: number;
  type:
    | 'damage'
    | 'defeat'
    | 'turn_start'
    | 'round_start'
    | 'battle_end'
    | 'action'
    | 'info'
    | 'heal'
    | 'shield'
    | 'revive';
  message: string;
  amount?: number;
  isCrit?: boolean;
}

export interface CombatVisualEvent {
  id: number;
  kind: 'cast' | 'damage' | 'heal' | 'shield' | 'revive';
  action: ActionType;
  sourceId: string;
  sourceCombatantId?: string;
  sourceSide: TeamSide;
  targetId?: string;
  targetCombatantId?: string;
  targetSide?: TeamSide;
  targetIds?: string[];
  targetCombatantIds?: string[];
  amount?: number;
  isCrit?: boolean;
}

interface BattleState {
  phase: 'idle' | 'starting' | 'turn_active' | 'turn_transition' | 'finished';
  round: number;
  turnIndex: number;
  currentTurnChampionId: string | null;
  currentTurnSide: 'player' | 'enemy' | null;
  playerTeam: CombatantInfo[];
  enemyTeam: CombatantInfo[];
  log: LogEntry[];
  logIdCounter: number;
  winner: 'player' | 'enemy' | 'draw' | null;
  isPlayerTurn: boolean;
  visualEvent: CombatVisualEvent | null;
  visualEventIdCounter: number;

  setPhase: (phase: BattleState['phase']) => void;
  setRound: (round: number) => void;
  setTurnInfo: (
    turnIndex: number,
    championId: string | null,
    side: 'player' | 'enemy' | null,
  ) => void;
  setTeams: (player: CombatantInfo[], enemy: CombatantInfo[]) => void;
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  showVisualEvent: (event: Omit<CombatVisualEvent, 'id'>) => void;
  setWinner: (winner: 'player' | 'enemy' | 'draw') => void;
  resetBattle: () => void;
}

const init = {
  phase: 'idle' as const,
  round: 0,
  turnIndex: 0,
  currentTurnChampionId: null,
  currentTurnSide: null,
  playerTeam: [] as CombatantInfo[],
  enemyTeam: [] as CombatantInfo[],
  log: [] as LogEntry[],
  logIdCounter: 0,
  winner: null as 'player' | 'enemy' | 'draw' | null,
  isPlayerTurn: false,
  visualEvent: null as CombatVisualEvent | null,
  visualEventIdCounter: 0,
};

export const useBattleStore = create<BattleState>((set) => ({
  ...init,
  setPhase: (phase) => set({ phase }),
  setRound: (round) => set({ round }),
  setTurnInfo: (turnIndex, championId, side) =>
    set({
      turnIndex,
      currentTurnChampionId: championId,
      currentTurnSide: side,
      isPlayerTurn: side === 'player',
    }),
  setTeams: (player, enemy) => set({ playerTeam: player, enemyTeam: enemy }),
  addLog: (entry) =>
    set((state) => ({
      log: [...state.log, { ...entry, id: state.logIdCounter + 1, timestamp: Date.now() }],
      logIdCounter: state.logIdCounter + 1,
    })),
  showVisualEvent: (event) =>
    set((state) => {
      const previous = state.visualEvent;
      const belongsToCurrentAction =
        event.kind !== 'cast' &&
        previous !== null &&
        previous.sourceId === event.sourceId &&
        previous.action === event.action;
      if (belongsToCurrentAction) {
        const targetIds = event.targetId
          ? [...new Set([...(previous.targetIds ?? []), event.targetId])]
          : (previous.targetIds ?? []);
        const targetCombatantIds = event.targetCombatantId
          ? [...new Set([...(previous.targetCombatantIds ?? []), event.targetCombatantId])]
          : (previous.targetCombatantIds ?? []);
        return {
          visualEvent: {
            ...previous,
            ...event,
            id: previous.id,
            targetIds,
            targetCombatantIds,
            amount:
              previous.kind === event.kind && event.amount !== undefined
                ? (previous.amount ?? 0) + event.amount
                : event.amount,
          },
        };
      }
      const id = state.visualEventIdCounter + 1;
      return {
        visualEvent: {
          ...event,
          id,
          targetIds: event.targetId ? [event.targetId] : [],
          targetCombatantIds: event.targetCombatantId ? [event.targetCombatantId] : [],
        },
        visualEventIdCounter: id,
      };
    }),
  setWinner: (winner) => set({ winner, phase: 'finished' }),
  resetBattle: () => set(init),
}));
