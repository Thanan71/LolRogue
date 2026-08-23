import { implementedChampions } from '@/data/champion';
import { championDB } from '@/data/championDatabase';
import { getRuneDefinition } from '@/data/items';
import type { SpellSlot } from '@/game/ChampionInstance';
import { MAX_STARTER_TEAM_SIZE } from '@/game/run/starterBudget';
import { SPELL_SLOTS } from '@/game/run/spellUpgradeRules';
import { enhancementTreeProvider } from '@/services/enhancementService';
import type { AuthorityRunAttempt, AuthorityRunCommand } from './types';

const IMPLEMENTED_CHAMPION_IDS = new Set(implementedChampions.map((champion) => champion.id));
const STARTER_RUNE_IDS = new Set([
  'press_the_attack',
  'electrocute',
  'summon_aery',
  'grasp_of_the_undying',
  'glacial_augment',
]);

export class AuthorityRunVerificationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly commandIndex: number | null = null,
  ) {
    super(message);
    this.name = 'AuthorityRunVerificationError';
  }
}

export function failAuthorityVerification(
  code: string,
  message: string,
  commandIndex: number | null = null,
): never {
  throw new AuthorityRunVerificationError(code, message, commandIndex);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requiredString(
  payload: Record<string, unknown>,
  key: string,
  commandIndex: number,
  maxLength = 160,
): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    failAuthorityVerification(
      'invalid_command',
      `Command payload "${key}" must be a non-empty string.`,
      commandIndex,
    );
  }
  return value;
}

export function parseRunCommand(value: unknown, commandIndex: number): AuthorityRunCommand {
  if (!isRecord(value) || !hasExactKeys(value, ['sequence', 'kind', 'payload'])) {
    failAuthorityVerification(
      'invalid_command',
      'Each command must contain exactly sequence, kind and payload.',
      commandIndex,
    );
  }
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1) {
    failAuthorityVerification(
      'invalid_sequence',
      'Command sequence must be a positive safe integer.',
      commandIndex,
    );
  }
  if (typeof value.kind !== 'string' || !isRecord(value.payload)) {
    failAuthorityVerification(
      'invalid_command',
      'Command kind and payload are invalid.',
      commandIndex,
    );
  }

  const sequence = value.sequence as number;
  const payload = value.payload;
  const nodePayload = (): { node_id: string } => {
    if (!hasExactKeys(payload, ['node_id'])) {
      failAuthorityVerification(
        'invalid_command',
        `${value.kind} expects only node_id.`,
        commandIndex,
      );
    }
    return { node_id: requiredString(payload, 'node_id', commandIndex) };
  };

  switch (value.kind) {
    case 'move_node':
    case 'rest':
    case 'recruit':
    case 'event':
    case 'treasure':
    case 'resolve_node':
      return { sequence, kind: value.kind, payload: nodePayload() };
    case 'resolve_combat':
      if (hasExactKeys(payload, ['node_id'])) {
        return {
          sequence,
          kind: value.kind,
          payload: {
            node_id: requiredString(payload, 'node_id', commandIndex),
            actions_json: 'auto',
          },
        };
      }
      if (!hasExactKeys(payload, ['actions_json', 'node_id'])) {
        failAuthorityVerification(
          'invalid_command',
          'resolve_combat expects node_id and actions_json.',
          commandIndex,
        );
      }
      return {
        sequence,
        kind: value.kind,
        payload: {
          node_id: requiredString(payload, 'node_id', commandIndex),
          actions_json: requiredString(payload, 'actions_json', commandIndex, 7000),
        },
      };
    case 'shop_buy_item':
      if (!hasExactKeys(payload, ['node_id', 'item_id'])) {
        failAuthorityVerification(
          'invalid_command',
          'shop_buy_item expects node_id and item_id.',
          commandIndex,
        );
      }
      return {
        sequence,
        kind: value.kind,
        payload: {
          node_id: requiredString(payload, 'node_id', commandIndex),
          item_id: requiredString(payload, 'item_id', commandIndex),
        },
      };
    case 'shop_recruit':
      if (!hasExactKeys(payload, ['node_id', 'champion_id'])) {
        failAuthorityVerification(
          'invalid_command',
          'shop_recruit expects node_id and champion_id.',
          commandIndex,
        );
      }
      return {
        sequence,
        kind: value.kind,
        payload: {
          node_id: requiredString(payload, 'node_id', commandIndex),
          champion_id: requiredString(payload, 'champion_id', commandIndex),
        },
      };
    case 'equip_item':
      if (!hasExactKeys(payload, ['instance_id', 'champion_id'])) {
        failAuthorityVerification(
          'invalid_command',
          'equip_item expects instance_id and champion_id.',
          commandIndex,
        );
      }
      return {
        sequence,
        kind: value.kind,
        payload: {
          instance_id: requiredString(payload, 'instance_id', commandIndex),
          champion_id: requiredString(payload, 'champion_id', commandIndex),
        },
      };
    case 'unequip_item':
    case 'sell_item':
      if (!hasExactKeys(payload, ['instance_id'])) {
        failAuthorityVerification(
          'invalid_command',
          `${value.kind} expects only instance_id.`,
          commandIndex,
        );
      }
      return {
        sequence,
        kind: value.kind,
        payload: { instance_id: requiredString(payload, 'instance_id', commandIndex) },
      };
    case 'choose_augment':
      if (!hasExactKeys(payload, ['augment_id'])) {
        failAuthorityVerification(
          'invalid_command',
          'choose_augment expects only augment_id.',
          commandIndex,
        );
      }
      return {
        sequence,
        kind: value.kind,
        payload: { augment_id: requiredString(payload, 'augment_id', commandIndex) },
      };
    case 'upgrade_spell': {
      if (!hasExactKeys(payload, ['champion_id', 'slot'])) {
        failAuthorityVerification(
          'invalid_command',
          'upgrade_spell expects champion_id and slot.',
          commandIndex,
        );
      }
      const slot = requiredString(payload, 'slot', commandIndex);
      if (!SPELL_SLOTS.includes(slot as SpellSlot)) {
        failAuthorityVerification(
          'invalid_command',
          'Spell slot must be Q, W, E or R.',
          commandIndex,
        );
      }
      return {
        sequence,
        kind: value.kind,
        payload: {
          champion_id: requiredString(payload, 'champion_id', commandIndex),
          slot: slot as SpellSlot,
        },
      };
    }
    case 'abandon_run':
      if (!hasExactKeys(payload, [])) {
        failAuthorityVerification(
          'invalid_command',
          'abandon_run payload must be empty.',
          commandIndex,
        );
      }
      return { sequence, kind: value.kind, payload: {} };
    default:
      failAuthorityVerification(
        'unknown_command',
        `Unsupported command kind "${value.kind}".`,
        commandIndex,
      );
  }
}

export function validateRunAttempt(value: AuthorityRunAttempt): void {
  if (!isRecord(value)) failAuthorityVerification('invalid_attempt', 'Attempt must be an object.');
  if (
    typeof value.runUuid !== 'string' ||
    value.runUuid.length === 0 ||
    value.runUuid.length > 160
  ) {
    failAuthorityVerification('invalid_attempt', 'Attempt runUuid is invalid.');
  }
  if (!Number.isSafeInteger(value.seed)) {
    failAuthorityVerification('invalid_attempt', 'Attempt seed is invalid.');
  }
  if (!['easy', 'normal', 'hard'].includes(value.difficulty)) {
    failAuthorityVerification('invalid_attempt', 'Attempt difficulty is invalid.');
  }
  if (!['normal', 'daily'].includes(value.mode)) {
    failAuthorityVerification('invalid_attempt', 'Attempt mode is invalid.');
  }
  if (
    !Array.isArray(value.team) ||
    value.team.length < 1 ||
    value.team.length > MAX_STARTER_TEAM_SIZE
  ) {
    failAuthorityVerification('invalid_attempt', 'Attempt must contain an allowed starter team.');
  }
  const teamIds = new Set<string>();
  for (const member of value.team) {
    if (
      !isRecord(member) ||
      typeof member.championId !== 'string' ||
      !IMPLEMENTED_CHAMPION_IDS.has(member.championId) ||
      !championDB.getById(member.championId) ||
      teamIds.has(member.championId)
    ) {
      failAuthorityVerification(
        'invalid_attempt',
        'Attempt team contains an invalid or duplicate champion.',
      );
    }
    const multiplier = member.statMultiplier ?? 1;
    if (!Number.isFinite(multiplier) || multiplier < 0.1 || multiplier > 10) {
      failAuthorityVerification('invalid_attempt', 'Attempt team stat multiplier is invalid.');
    }
    teamIds.add(member.championId);
  }
  if (
    !Array.isArray(value.runeIds) ||
    value.runeIds.length > 3 ||
    new Set(value.runeIds).size !== value.runeIds.length ||
    value.runeIds.some(
      (id) => typeof id !== 'string' || !STARTER_RUNE_IDS.has(id) || !getRuneDefinition(id),
    )
  ) {
    failAuthorityVerification('invalid_attempt', 'Attempt rune loadout is invalid.');
  }
  if (!isRecord(value.enhancementSnapshot)) {
    failAuthorityVerification('invalid_attempt', 'Attempt enhancement snapshot is invalid.');
  }
  for (const [championId, ranks] of Object.entries(value.enhancementSnapshot)) {
    if (
      !IMPLEMENTED_CHAMPION_IDS.has(championId) ||
      !championDB.getById(championId) ||
      !isRecord(ranks)
    ) {
      failAuthorityVerification(
        'invalid_attempt',
        'Attempt enhancement snapshot contains an invalid champion.',
      );
    }
    const champion = championDB.getById(championId);
    if (!champion) {
      failAuthorityVerification('invalid_attempt', 'Attempt enhancement champion is unavailable.');
    }
    const tree = enhancementTreeProvider.getTreeForChampion(champion);
    const nodes = [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)];
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (const [nodeId, rank] of Object.entries(ranks)) {
      const node = nodeById.get(nodeId);
      if (
        !node ||
        !Number.isSafeInteger(rank) ||
        (rank as number) < 0 ||
        (rank as number) > (node.maxRanks ?? 1)
      ) {
        failAuthorityVerification(
          'invalid_attempt',
          'Attempt enhancement snapshot contains an invalid rank.',
        );
      }
      if (
        (rank as number) > 0 &&
        node.prerequisites.some(
          (prerequisiteId) =>
            !Number.isSafeInteger(ranks[prerequisiteId]) || ranks[prerequisiteId] < 1,
        )
      ) {
        failAuthorityVerification(
          'invalid_attempt',
          'Attempt enhancement prerequisites are incomplete.',
        );
      }
    }
  }
  if (!isRecord(value.masterySnapshot)) {
    failAuthorityVerification('invalid_attempt', 'Attempt mastery snapshot is invalid.');
  }
  for (const [championId, level] of Object.entries(value.masterySnapshot)) {
    if (
      !IMPLEMENTED_CHAMPION_IDS.has(championId) ||
      !championDB.getById(championId) ||
      !Number.isSafeInteger(level) ||
      (level as number) < 0 ||
      (level as number) > 4
    ) {
      failAuthorityVerification(
        'invalid_attempt',
        'Attempt mastery snapshot contains an invalid level.',
      );
    }
  }
}
