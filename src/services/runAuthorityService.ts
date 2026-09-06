import {
  appendRunAttemptCommands,
  findOpenRunAttempt,
  recoverVerifiedRunAttempt,
  sealRunAttempt,
  startRunAttempt,
  verifyRunAttempt,
} from '@/services/runAttemptService';

/** Explicit boundary between the UI lifecycle and the remote run authority. */
export const runAuthorityService = {
  startAttempt: startRunAttempt,
  findOpenAttempt: findOpenRunAttempt,
  appendCommands: appendRunAttemptCommands,
  sealAttempt: sealRunAttempt,
  verifyAttempt: verifyRunAttempt,
  recoverAttempt: recoverVerifiedRunAttempt,
};
