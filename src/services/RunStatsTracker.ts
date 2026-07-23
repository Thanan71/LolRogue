/**
 * RunStatsTracker — accumulates per-champion statistics during a run.
 *
 * Singleton-like helper that records kills and damage per champion,
 * then produces a RunSummary when the run ends.
 */

import type { Biome, ChampionRunStats, RunSummary } from '@/types/run';

export class RunStatsTracker {
  /** championId → accumulated stats */
  private stats = new Map<string, ChampionRunStats>();

  /** Reset all tracked stats (call at run start) */
  reset(): void {
    this.stats.clear();
  }

  /** Record a kill for a champion */
  recordKill(championId: string): void {
    const s = this.getOrCreate(championId);
    s.kills += 1;
  }

  /** Record damage dealt by a champion */
  recordDamage(championId: string, amount: number): void {
    const s = this.getOrCreate(championId);
    s.totalDamage += amount;
  }

  /** Mark champions that survived (alive at run end) */
  markSurvived(teamIds: string[]): void {
    for (const id of teamIds) {
      const s = this.getOrCreate(id);
      s.survived = true;
    }
  }

  /** Build the final run summary */
  buildSummary(opts: {
    won: boolean;
    wavesCompleted: number;
    biomesVisited: Biome[];
    goldEarned: number;
    runLevel: number;
  }): RunSummary {
    const championStats = Array.from(this.stats.values());
    let totalKills = 0;
    let totalDamage = 0;
    for (const s of championStats) {
      totalKills += s.kills;
      totalDamage += s.totalDamage;
    }
    return {
      won: opts.won,
      wavesCompleted: opts.wavesCompleted,
      biomesVisited: opts.biomesVisited,
      championStats,
      totalKills,
      totalDamage,
      goldEarned: opts.goldEarned,
      runLevel: opts.runLevel,
    };
  }

  /** Get the kill count for a specific champion */
  getKills(championId: string): number {
    return this.stats.get(championId)?.kills ?? 0;
  }

  /** Get the total damage for a specific champion */
  getDamage(championId: string): number {
    return this.stats.get(championId)?.totalDamage ?? 0;
  }

  /** Export current stats as a plain array */
  toArray(): ChampionRunStats[] {
    return Array.from(this.stats.values());
  }

  private getOrCreate(championId: string): ChampionRunStats {
    let s = this.stats.get(championId);
    if (!s) {
      s = { championId, kills: 0, totalDamage: 0, survived: false };
      this.stats.set(championId, s);
    }
    return s;
  }
}

/** Singleton instance for the active run */
export const runStatsTracker = new RunStatsTracker();
