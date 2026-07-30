import { ActionType, type BattleAction } from './types';

export interface CombatActionTraceEntry extends BattleAction {
  automatic: boolean;
}

export type CombatActionTrace = CombatActionTraceEntry[];

const ACTION_CODES: Record<ActionType, string> = {
  [ActionType.BasicAttack]: 'a',
  [ActionType.SpellQ]: 'q',
  [ActionType.SpellW]: 'w',
  [ActionType.SpellE]: 'e',
  [ActionType.SpellR]: 'r',
};
const CODE_ACTIONS = new Map(
  Object.entries(ACTION_CODES).map(([action, code]) => [code, action as ActionType]),
);
export const MAX_COMBAT_ACTIONS = 500;
export const MAX_COMBAT_ACTION_TRACE_LENGTH = 7000;

export function encodeCombatActionTrace(trace: CombatActionTrace): string {
  if (trace.length > MAX_COMBAT_ACTIONS) throw new Error('combat_action_trace_too_long');
  const encoded = JSON.stringify(
    trace.map((action) => [
      ACTION_CODES[action.type],
      action.targetId ?? null,
      action.automatic ? 1 : 0,
    ]),
  );
  if (encoded.length > MAX_COMBAT_ACTION_TRACE_LENGTH) {
    throw new Error('combat_action_trace_too_large');
  }
  return encoded;
}

export function decodeCombatActionTrace(value: string): CombatActionTrace | null {
  if (!value || value.length > MAX_COMBAT_ACTION_TRACE_LENGTH) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > MAX_COMBAT_ACTIONS) return null;
    const trace: CombatActionTrace = [];
    for (const entry of parsed) {
      if (!Array.isArray(entry) || entry.length !== 3) return null;
      const type = typeof entry[0] === 'string' ? CODE_ACTIONS.get(entry[0]) : undefined;
      const targetId = entry[1];
      const automatic = entry[2];
      if (
        !type ||
        (automatic !== 0 && automatic !== 1) ||
        (targetId !== null &&
          (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 160))
      ) {
        return null;
      }
      trace.push({ type, targetId: targetId ?? undefined, automatic: automatic === 1 });
    }
    return trace;
  } catch {
    return null;
  }
}
