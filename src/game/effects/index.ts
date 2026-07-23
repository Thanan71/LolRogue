/**
 * Effect System — public exports.
 */

export type { BuffDebuffParams } from './BuffDebuffEffect';
export { BuffDebuffEffect, createBuff, createDebuff } from './BuffDebuffEffect';
export type { CCEffectParams } from './CCEffect';
export { CCEffect } from './CCEffect';
export type { DamageEffectParams } from './DamageEffect';
// Effect classes
export { DamageEffect } from './DamageEffect';
export type { EffectEventHandler } from './Effect';
// Base class
export { Effect, generateEffectId } from './Effect';
export type { EffectManagerEventCallback } from './EffectManager';
// Manager
export { EffectManager } from './EffectManager';
export type { ExecuteEffectParams } from './ExecuteEffect';
export { ExecuteEffect } from './ExecuteEffect';
export type { HealEffectParams } from './HealEffect';
export { HealEffect } from './HealEffect';
export type { ShieldEffectParams } from './ShieldEffect';
export { ShieldEffect } from './ShieldEffect';
// Types
export * from './types';
