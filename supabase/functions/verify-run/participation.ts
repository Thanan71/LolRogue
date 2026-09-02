export interface VerifiedParticipation {
  wavesParticipated: number;
  biomesParticipated: string[];
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

/**
 * Rebuild v20 participation from successful canonical combat summaries instead
 * of trusting the v20 ledger field. The published v20 authority bundle records
 * the terminal lost combat as participation even though totalWavesCompleted only
 * advances on player victories.
 */
export function deriveCompletedParticipation(
  combatSummaries: unknown,
): Record<string, VerifiedParticipation> | null {
  if (!Array.isArray(combatSummaries)) return null;

  const participation: Record<string, VerifiedParticipation> = {};
  for (const rawSummary of combatSummaries) {
    const summary = record(rawSummary);
    const playerTeam = record(summary?.playerTeam);
    const initial = Array.isArray(playerTeam?.initial) ? playerTeam.initial : null;
    if (
      !summary ||
      (summary.winner !== 'player' && summary.winner !== 'enemy' && summary.winner !== 'draw') ||
      typeof summary.biome !== 'string' ||
      !initial
    ) {
      return null;
    }

    const championIds = new Set<string>();
    for (const rawCombatant of initial) {
      const combatant = record(rawCombatant);
      if (!combatant || typeof combatant.championId !== 'string') return null;
      championIds.add(combatant.championId);
    }

    if (summary.winner !== 'player') continue;

    for (const championId of championIds) {
      const current = participation[championId] ?? {
        wavesParticipated: 0,
        biomesParticipated: [],
      };
      current.wavesParticipated += 1;
      if (!current.biomesParticipated.includes(summary.biome)) {
        current.biomesParticipated.push(summary.biome);
      }
      participation[championId] = current;
    }
  }

  return participation;
}
