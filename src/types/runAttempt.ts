export type AuthorityRunMode = 'normal' | 'daily';
export type AuthorityDifficulty = 'easy' | 'normal' | 'hard';

export type RunAttemptStatus =
  | 'started'
  | 'active'
  | 'finished'
  | 'verifying'
  | 'verified'
  | 'rejected'
  | 'expired';

export type RunEnhancementSnapshot = Record<string, Record<string, number>>;

export type RunCommandInput =
  | { kind: 'move_node'; nodeId: string }
  | { kind: 'resolve_combat'; nodeId: string }
  | { kind: 'shop_buy_item'; nodeId: string; itemId: string }
  | { kind: 'shop_recruit'; nodeId: string; championId: string }
  | { kind: 'rest'; nodeId: string }
  | { kind: 'recruit'; nodeId: string }
  | { kind: 'event'; nodeId: string }
  | { kind: 'treasure'; nodeId: string }
  | { kind: 'resolve_node'; nodeId: string }
  | { kind: 'equip_item'; instanceId: string; championId: string }
  | { kind: 'unequip_item'; instanceId: string }
  | { kind: 'sell_item'; instanceId: string }
  | { kind: 'choose_augment'; augmentId: string }
  | { kind: 'upgrade_spell'; championId: string; slot: 'Q' | 'W' | 'E' | 'R' }
  | { kind: 'abandon_run' };

export interface RunAttemptCommand {
  commandId: string;
  sequence: number;
  kind: RunCommandInput['kind'];
  payload: Record<string, string>;
  /** Stable semantic identity used to suppress duplicate UI/effect invocations. */
  dedupeKey: string;
}

export interface RunAuthorityAttempt {
  attemptId: string;
  runUuid: string;
  ownerUserId: string;
  seed: number;
  rulesetVersion: number;
  engineVersion: string;
  difficulty: AuthorityDifficulty;
  mode: AuthorityRunMode;
  initialTeam: string[];
  runeIds: string[];
  enhancementSnapshot: RunEnhancementSnapshot;
  startedAt: string;
  expiresAt: string;
  status: RunAttemptStatus;
  commands: RunAttemptCommand[];
  nextSequence: number;
  lastAcknowledgedSequence: number;
  journalHash: string;
  finishCommandId: string | null;
}

export interface PendingRunAttemptStart {
  commandId: string;
  ownerUserId: string;
  mode: AuthorityRunMode;
  team: string[];
  runeIds: string[];
  difficulty: AuthorityDifficulty;
}

export interface StartRunAttemptInput {
  commandId: string;
  mode: AuthorityRunMode;
  team: string[];
  runeIds: string[];
  difficulty: AuthorityDifficulty;
}

export interface StartRunAttemptResult {
  attemptId: string;
  runUuid: string;
  status: 'started';
  rulesetVersion: number;
  engineVersion: string;
  seed: number;
  mode: AuthorityRunMode;
  difficulty: AuthorityDifficulty;
  initialTeam: string[];
  runeIds: string[];
  enhancementSnapshot: RunEnhancementSnapshot;
  startedAt: string;
  expiresAt: string;
  lastSequence: number;
  journalHash: string;
  replayed: boolean;
}

export interface AppendRunCommandsResult {
  attemptId: string;
  status: RunAttemptStatus;
  lastSequence: number;
  journalHash: string;
  accepted: number;
  replayed: boolean;
}

export interface SealRunAttemptResult {
  attemptId: string;
  runUuid: string;
  status: 'finished' | 'expired' | 'verified' | 'rejected';
  lastSequence: number;
  journalHash: string;
  accepted: boolean;
  replayed: boolean;
}

export interface RunAttemptStatusResult {
  attemptId: string;
  runUuid: string;
  status: RunAttemptStatus;
  rulesetVersion: number;
  engineVersion: string;
  seed: number;
  mode: AuthorityRunMode;
  difficulty: AuthorityDifficulty;
  initialTeam: string[];
  runeIds: string[];
  startedAt: string;
  expiresAt: string;
  lastSequence: number;
  journalHash: string;
  response: unknown;
  rejectionCode: string | null;
}
