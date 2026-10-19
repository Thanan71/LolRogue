import { describeAdminAnalyticsRate } from '../analytics/adminAnalyticsStatistics';

export const ADMIN_BALANCE_MIN_PLAYERS = 30;

export interface AdminBalanceRate {
  runs: number;
  wins: number;
  uniquePlayers: number;
  rate: number | null;
  interval95: { lower: number; upper: number } | null;
  status: 'empty' | 'insufficient' | 'repeated_players' | 'descriptive';
}

/**
 * Observed run outcomes are descriptive, never a causal champion/item effect.
 * A player with repeated runs is not several independent player observations.
 * Without per-player outcomes, no player-level interval can be reconstructed.
 */
export function describeAdminBalanceWinRate(
  wins: number,
  runs: number,
  uniquePlayers: number,
): AdminBalanceRate {
  if (!Number.isSafeInteger(uniquePlayers) || uniquePlayers < 0 || uniquePlayers > runs)
    throw new RangeError('Invalid balance player count.');
  const observed = describeAdminAnalyticsRate(wins, runs);
  if ((runs === 0) !== (uniquePlayers === 0))
    throw new RangeError('Balance runs and players must describe the same population.');
  const base = { runs, wins, uniquePlayers, rate: observed.rate };
  if (runs === 0) return { ...base, interval95: null, status: 'empty' };
  if (uniquePlayers < runs) return { ...base, interval95: null, status: 'repeated_players' };
  return {
    ...base,
    interval95: observed.interval95,
    status: uniquePlayers < ADMIN_BALANCE_MIN_PLAYERS ? 'insufficient' : 'descriptive',
  };
}
