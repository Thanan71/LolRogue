import { encodeCombatActionTrace } from '@/game/battle/actionTrace';
import type { RunState } from '@/types/run';
import type {
  PendingRunAttemptStart,
  RunAuthorityAttempt,
  RunCommandInput,
} from '@/types/runAttempt';
import { getAuthorityVersion } from '@/game/authority/versionRegistry';

export function usesCanonicalProgression(attempt: RunAuthorityAttempt | null): boolean {
  return (
    attempt === null ||
    getAuthorityVersion(attempt.engineVersion)?.features.canonicalProgression === true
  );
}

export function createRunCommandId(): string | null {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : null;
}

export function isSamePendingRunStart(
  pending: PendingRunAttemptStart | null,
  requested: Omit<PendingRunAttemptStart, 'commandId'>,
): pending is PendingRunAttemptStart {
  return (
    pending !== null &&
    pending.ownerUserId === requested.ownerUserId &&
    pending.mode === requested.mode &&
    pending.difficulty === requested.difficulty &&
    pending.team.length === requested.team.length &&
    pending.team.every((id, index) => id === requested.team[index]) &&
    pending.runeIds.length === requested.runeIds.length &&
    pending.runeIds.every((id, index) => id === requested.runeIds[index])
  );
}

export function serializeRunCommand(command: RunCommandInput): Record<string, string> {
  switch (command.kind) {
    case 'move_node':
    case 'rest':
    case 'recruit':
    case 'event':
    case 'treasure':
    case 'resolve_node':
      return { node_id: command.nodeId };
    case 'resolve_combat':
      return command.actions && command.actions.some((action) => !action.automatic)
        ? { node_id: command.nodeId, actions_json: encodeCombatActionTrace(command.actions) }
        : { node_id: command.nodeId };
    case 'shop_buy_item':
      return { node_id: command.nodeId, item_id: command.itemId };
    case 'shop_recruit':
      return { node_id: command.nodeId, champion_id: command.championId };
    case 'equip_item':
      return { instance_id: command.instanceId, champion_id: command.championId };
    case 'unequip_item':
    case 'sell_item':
      return { instance_id: command.instanceId };
    case 'choose_augment':
      return { augment_id: command.augmentId };
    case 'upgrade_spell':
      return { champion_id: command.championId, slot: command.slot };
    case 'abandon_run':
      return {};
  }
}

export function appendRunAuthorityCommand(
  state: RunState,
  currentUserId: string | null,
  command: RunCommandInput,
  explicitDedupeKey?: string,
): { success: true; authorityAttempt: RunAuthorityAttempt | null } | { success: false } {
  const attempt = state.authorityAttempt;
  if (!attempt) return { success: true, authorityAttempt: null };
  let payload: Record<string, string>;
  try {
    payload = serializeRunCommand(command);
  } catch {
    return { success: false };
  }
  if (
    !state.isActive ||
    state.isEnding ||
    state.completedRunSnapshot !== null ||
    !['started', 'active'].includes(attempt.status) ||
    currentUserId !== attempt.ownerUserId ||
    !Object.entries(payload).every(
      ([key, value]) =>
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= (key === 'actions_json' ? 7000 : 160),
    )
  ) {
    return { success: false };
  }

  if (explicitDedupeKey) {
    const existing = attempt.commands.find(
      (candidate) => candidate.dedupeKey === explicitDedupeKey,
    );
    if (existing) {
      return existing.kind === command.kind &&
        JSON.stringify(existing.payload) === JSON.stringify(payload)
        ? { success: true, authorityAttempt: attempt }
        : { success: false };
    }
  }
  const commandId = createRunCommandId();
  if (!commandId) return { success: false };
  const dedupeKey = explicitDedupeKey ?? commandId;
  return {
    success: true,
    authorityAttempt: {
      ...attempt,
      commands: [
        ...attempt.commands,
        {
          commandId,
          sequence: attempt.nextSequence,
          kind: command.kind,
          payload,
          dedupeKey,
        },
      ],
      nextSequence: attempt.nextSequence + 1,
    },
  };
}
