import type { RunProgressionDefinition, RunProgressionTargetTier } from '@/types/champion';
import type { CalculatedStats } from '@/utils/champion';

const UNSAFE_KEY_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_COUNTERS = 64;

export function isRunCounterKey(key: string): boolean {
  return (
    key.length <= 128 &&
    /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(key) &&
    key.split('.').every((segment) => !UNSAFE_KEY_SEGMENTS.has(segment))
  );
}

function isCounterValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isRunProgressionDefinition(definition: RunProgressionDefinition): boolean {
  if (
    !isRunCounterKey(definition.key) ||
    !isCounterValue(definition.cap) ||
    definition.cap === 0 ||
    !definition.name ||
    !definition.description
  )
    return false;
  const statKeys = ['abilityPower', 'attackDamage', 'armor', 'magicResist'];
  if (
    definition.statBonuses &&
    !Object.entries(definition.statBonuses).every(
      ([stat, bonus]) => statKeys.includes(stat) && Number.isFinite(bonus) && bonus >= 0,
    )
  )
    return false;
  return (
    (['onDamage', 'onKill', 'onCombatEnd'] as const).every(
      (hook) =>
        definition[hook] === undefined ||
        (definition[hook]?.length !== 0 &&
          definition[hook]?.every(
            (trigger) =>
              isCounterValue(trigger.amount) &&
              trigger.amount > 0 &&
              (trigger.targetTier === undefined ||
                ['normal', 'elite', 'boss'].includes(trigger.targetTier)) &&
              (trigger.abilityOnly === undefined || typeof trigger.abilityOnly === 'boolean'),
          ) === true),
    ) && (['onDamage', 'onKill', 'onCombatEnd'] as const).some((hook) => definition[hook]?.length)
  );
}

/** Strict validation for persisted input; definitions additionally enforce declared keys and caps. */
export function isRunProgressSnapshot(
  value: unknown,
  definitions?: readonly RunProgressionDefinition[],
): value is Record<string, number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value);
  if (entries.length > MAX_COUNTERS) return false;
  return entries.every(([key, count]) => {
    if (!isRunCounterKey(key) || !isCounterValue(count)) return false;
    if (!definitions) return true;
    const definition = definitions.find((candidate) => candidate.key === key);
    return definition !== undefined && isCounterValue(definition.cap) && count <= definition.cap;
  });
}

/** Clone trusted domain input, rejecting unsafe values and clamping declared counters to their caps. */
export function cloneRunProgressSnapshot(
  value: unknown,
  definitions?: readonly RunProgressionDefinition[],
): Record<string, number> {
  if (!isRunProgressSnapshot(value)) return {};
  const snapshot: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    const definition = definitions?.find((candidate) => candidate.key === key);
    if (definitions && (!definition || !isCounterValue(definition.cap))) continue;
    const next = definition ? Math.min(count, definition.cap) : count;
    if (next > 0) snapshot[key] = next;
  }
  return snapshot;
}

export interface RunProgressionContext {
  hook: 'onDamage' | 'onKill' | 'onCombatEnd';
  targetTier?: RunProgressionTargetTier;
  ability: boolean;
}

/** Pure trigger evaluation; the combat host owns event identity and mutation. */
export function resolveRunProgressionGains(
  definitions: readonly RunProgressionDefinition[],
  context: RunProgressionContext,
): { key: string; amount: number }[] {
  return definitions.flatMap((definition) => {
    if (!isRunCounterKey(definition.key) || !isCounterValue(definition.cap)) return [];
    const trigger = definition[context.hook]?.find(
      (candidate) =>
        isCounterValue(candidate.amount) &&
        candidate.amount > 0 &&
        (!candidate.targetTier || candidate.targetTier === context.targetTier) &&
        (!candidate.abilityOnly || context.ability),
    );
    return trigger ? [{ key: definition.key, amount: trigger.amount }] : [];
  });
}

/** Permanent run bonuses are additive after level, mastery and enhancement scaling. */
export function applyRunProgressStatBonuses(
  stats: CalculatedStats,
  definitions: readonly RunProgressionDefinition[] | undefined,
  progress: Readonly<Record<string, number>> | null,
): CalculatedStats {
  if (!definitions?.length || !progress) return stats;
  const enhancedStats = { ...stats };
  for (const definition of definitions) {
    const count = progress[definition.key] ?? 0;
    if (count === 0) continue;
    for (const stat of ['abilityPower', 'attackDamage', 'armor', 'magicResist'] as const) {
      const perStack = definition.statBonuses?.[stat];
      if (perStack !== undefined && Number.isFinite(perStack) && perStack >= 0) {
        enhancedStats[stat] += count * perStack;
      }
    }
  }
  return enhancedStats;
}
