import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  verifyAuthorityRun,
} from './AuthorityRunEngine';

export {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  AuthorityRunVerificationError,
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
    verify: verifyAuthorityRun,
  },
] as const;

export function getAuthorityVerifier(engineVersion: string, contentHash: string) {
  return AUTHORITY_VERIFIERS.find(
    (candidate) =>
      candidate.engineVersion === engineVersion && candidate.contentHash === contentHash,
  );
}
