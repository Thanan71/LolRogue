/**
 * Effect System — public exports.
 */

// Types
export * from './types';

// Base class
export { Effect, generateEffectId } from './Effect';
export type { EffectEventHandler } from './Effect';

// Effect classes
export { DamageEffect } from './DamageEffect';
export type { DamageEffectParams } from './DamageEffect';

export { HealEffect } from './HealEffect';
export type { HealEffectParams } from './HealEffect';

export { ShieldEffect } from './ShieldEffect';
export type { ShieldEffectParams } from './ShieldEffect';

export { CCEffect } from './CCEffect';
export type { CCEffectParams } from './CCEffect';

export { BuffDebuffEffect, createBuff, createDebuff } from './BuffDebuffEffect';
export type { BuffDebuffParams } from './BuffDebuffEffect';

export { ExecuteEffect } from './ExecuteEffect';
export type { ExecuteEffectParams } from './ExecuteEffect';

// Manager
export { EffectManager } from './EffectManager';
export type { EffectManagerEventCallback } from './EffectManager';
