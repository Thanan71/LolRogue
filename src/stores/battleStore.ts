import { create } from 'zustand';

export interface SpellInfo {
  slot: 'Q' | 'W' | 'E' | 'R';
  name: string;
  cooldownMax: number;
  cooldownCurrent: number;
  cost: number;
  isReady: boolean;
}

export interface CombatantInfo {
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
    | 'shield';
  message: string;
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

  setPhase: (phase: BattleState['phase']) => void;
  setRound: (round: number) => void;
  setTurnInfo: (
    turnIndex: number,
    championId: string | null,
    side: 'player' | 'enemy' | null,
  ) => void;
  setTeams: (player: CombatantInfo[], enemy: CombatantInfo[]) => void;
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
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
  setWinner: (winner) => set({ winner, phase: 'finished' }),
  resetBattle: () => set(init),
}));
