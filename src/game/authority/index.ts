import { championDB } from '@/data/championDatabase';
import { isRunProgressSnapshot } from '@/game/runProgression';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  createAuthorityReplaySession,
  replayAuthorityRun,
  verifyAuthorityRun,
} from './AuthorityRunEngine';

export {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  AuthorityRunVerificationError,
  createAuthorityReplaySession,
  replayAuthorityRun,
  verifyAuthorityRun,
} from './AuthorityRunEngine';
export type * from './types';

/**
 * Every deployed verifier stays registered for at least the maximum attempt TTL.
 * A new gameplay release adds a registry entry instead of replacing an in-flight
 * engine contract.
 */
const AUTHORITY_VERIFIERS = [
  {
    engineVersion: AUTHORITY_ENGINE_VERSION,
    contentHash: AUTHORITY_CONTENT_HASH,
    replay: replayAuthorityRun,
    createSession: createAuthorityReplaySession,
    verify: verifyAuthorityRun,
    /** Edge finalization validates counters against the same frozen champion kit as replay. */
    validateRunProgress: (championId: string, progress: unknown): boolean => {
      const champion = championDB.getById(championId);
      return Boolean(
        champion && isRunProgressSnapshot(progress, champion.passive.runProgression ?? []),
      );
    },
  },
] as const;

export function getAuthorityVerifier(engineVersion: string, contentHash: string) {
  return AUTHORITY_VERIFIERS.find(
    (candidate) =>
      candidate.engineVersion === engineVersion && candidate.contentHash === contentHash,
  );
}
