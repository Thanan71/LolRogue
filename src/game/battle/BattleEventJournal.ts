import { BattlePhase, type BattleEvent, type BattleResult } from './types';

export type BattleEventCallback = (event: BattleEvent) => void;

/** Owns the observable event stream and derives the immutable terminal result. */
export class BattleEventJournal {
  private events: BattleEvent[] = [];
  private readonly listeners = new Set<BattleEventCallback>();

  read(): readonly BattleEvent[] {
    return this.events;
  }

  reset(): void {
    this.events = [];
  }

  subscribe(callback: BattleEventCallback): void {
    this.listeners.add(callback);
  }

  unsubscribe(callback: BattleEventCallback): void {
    this.listeners.delete(callback);
  }

  append(event: BattleEvent): void {
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  result(phase: BattlePhase): BattleResult | null {
    if (phase !== BattlePhase.Finished) return null;
    const last = this.events[this.events.length - 1];
    if (last?.type !== 'battle_end') return null;
    return { winner: last.winner, totalRounds: last.rounds, log: [...this.events] };
  }
}
