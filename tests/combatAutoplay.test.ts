import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMBAT_AUTOPLAY,
  getAutoTurnDelayMs,
  shouldAutoAdvanceCombatTurn,
  supportsManualAuthorityCombat,
} from '@/game/battle/autoplay';
import { AUTHORITY_VERSION_REGISTRY } from '@/game/authority/versionRegistry';

describe('combat autoplay rules', () => {
  it('starts disabled and pauses indefinitely on a manual player decision', () => {
    expect(DEFAULT_COMBAT_AUTOPLAY).toBe(false);
    expect(
      shouldAutoAdvanceCombatTurn({
        phase: 'turn_active',
        isAuthorityRun: false,
        autoPlay: false,
        isPlayerTurn: true,
      }),
    ).toBe(false);
  });

  it('automates enemy, opted-in and authoritative turns only while a turn is active', () => {
    expect(
      shouldAutoAdvanceCombatTurn({
        phase: 'turn_active',
        isAuthorityRun: false,
        autoPlay: false,
        isPlayerTurn: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoAdvanceCombatTurn({
        phase: 'turn_active',
        isAuthorityRun: false,
        autoPlay: true,
        isPlayerTurn: true,
      }),
    ).toBe(true);
    expect(
      shouldAutoAdvanceCombatTurn({
        phase: 'turn_active',
        isAuthorityRun: true,
        autoPlay: false,
        isPlayerTurn: true,
      }),
    ).toBe(true);
    expect(
      shouldAutoAdvanceCombatTurn({
        phase: 'finished',
        isAuthorityRun: true,
        autoPlay: true,
        isPlayerTurn: false,
      }),
    ).toBe(false);
  });

  it('uses a visible, playable delay for every supported speed', () => {
    expect(getAutoTurnDelayMs(1)).toBe(1200);
    expect(getAutoTurnDelayMs(2)).toBe(600);
    expect(getAutoTurnDelayMs(3)).toBe(400);
  });

  it('derives manual combat support from every registry entry', () => {
    for (const version of AUTHORITY_VERSION_REGISTRY) {
      expect(supportsManualAuthorityCombat(version.engine)).toBe(version.features.manualCombat);
    }
    expect(supportsManualAuthorityCombat('invalid-engine')).toBe(false);
  });
});
