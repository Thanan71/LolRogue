import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionRegistry';
import type { RunHistoryEntry } from '@/services/interfaces/IRunRepository';

/** A cohort matches only when its authoritative gameplay version matches this client. */
export function historyComparison(
  entry: RunHistoryEntry,
): 'legacy' | 'nonComparable' | 'comparable' {
  if (!entry.attempt || entry.run.progression_source !== 'verified') return 'legacy';
  if (
    entry.attempt.engineVersion !== CURRENT_AUTHORITY_VERSION.engine ||
    entry.attempt.gameplayRulesetVersion !== CURRENT_AUTHORITY_VERSION.gameplay
  )
    return 'nonComparable';
  return 'comparable';
}
