import { DamageType } from '@/game/effects/types';

/** Convert catalog aliases to the canonical damage type used by combat rules. */
export function toCombatDamageType(value: string | undefined): DamageType {
  if (value === 'true') return DamageType.True;
  if (value === 'magical' || value === 'ap') return DamageType.AP;
  return DamageType.AD;
}
