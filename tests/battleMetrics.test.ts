import { describe, expect, it } from 'vitest';
import { createEmptyBattleMetrics, reduceBattleMetrics } from '@/game/battle/battleMetrics';
import type { BattleEvent } from '@/game/battle/types';
import { CCType } from '@/game/effects/types';

describe('authoritative battle metrics', () => {
  it('creates independent empty side counters', () => {
    const metrics = createEmptyBattleMetrics();
    metrics.bySide.player.actionsLost++;

    expect(metrics).toMatchObject({
      rounds: 0,
      bySide: {
        player: { actionsLost: 1 },
        enemy: { actionsLost: 0 },
      },
    });
  });

  it('reduces damage, support, controls and lost actions by the responsible side', () => {
    const events: BattleEvent[] = [
      { type: 'round_start', round: 1, turnOrder: [] },
      {
        type: 'damage',
        source: 'Garen',
        target: 'Malphite',
        amount: 100,
        hpDamage: 70,
        shieldDamage: 30,
        isCrit: false,
        sourceSide: 'player',
        targetSide: 'enemy',
      },
      {
        type: 'damage',
        source: 'Annie',
        target: 'Garen',
        amount: 45,
        shieldDamage: 15,
        isCrit: false,
        sourceSide: 'enemy',
        targetSide: 'player',
      },
      {
        type: 'heal',
        source: 'Soraka',
        target: 'Garen',
        amount: 25,
        overheal: 5,
        sourceSide: 'player',
        targetSide: 'player',
      },
      {
        type: 'heal',
        source: 'Warwick',
        target: 'Warwick',
        amount: 10,
        overheal: 3,
        sourceSide: 'enemy',
        targetSide: 'enemy',
      },
      {
        type: 'shield',
        source: 'Lux',
        target: 'Garen',
        amount: 40,
        sourceSide: 'player',
        targetSide: 'player',
      },
      {
        type: 'shield',
        source: 'Legacy',
        target: 'Annie',
        amount: 20,
        countsAsShield: false,
        sourceSide: 'enemy',
        targetSide: 'enemy',
      },
      {
        type: 'crowd_control_applied',
        source: 'Annie',
        target: 'Malphite',
        sourceSide: 'player',
        targetSide: 'enemy',
        ccType: CCType.Stun,
        duration: 2,
      },
      {
        type: 'crowd_control_applied',
        source: 'Ashe',
        target: 'Malphite',
        sourceSide: 'player',
        targetSide: 'enemy',
        ccType: CCType.Slow,
        duration: 1.5,
      },
      {
        type: 'crowd_control_applied',
        source: 'Malphite',
        target: 'Garen',
        sourceSide: 'enemy',
        targetSide: 'player',
        ccType: CCType.Snare,
        duration: 3,
      },
      {
        type: 'turn_skipped',
        champion: 'Malphite',
        side: 'enemy',
        round: 1,
        turnIndex: 1,
        reason: 'hard_crowd_control',
        crowdControlTypes: [CCType.Stun],
      },
      {
        type: 'turn_skipped',
        champion: 'Garen',
        side: 'player',
        round: 2,
        turnIndex: 0,
        reason: 'hard_crowd_control',
        crowdControlTypes: [CCType.Knockup],
      },
      { type: 'round_start', round: 3, turnOrder: [] },
      { type: 'battle_end', winner: 'player', rounds: 2 },
    ];
    const original = structuredClone(events);

    expect(reduceBattleMetrics(events)).toEqual({
      rounds: 3,
      bySide: {
        player: {
          hpDamageDealt: 70,
          shieldDamageDealt: 30,
          healingDone: 25,
          overhealing: 5,
          shieldingDone: 40,
          crowdControlApplications: 2,
          crowdControlDuration: 3.5,
          actionsLost: 1,
        },
        enemy: {
          hpDamageDealt: 30,
          shieldDamageDealt: 15,
          healingDone: 10,
          overhealing: 3,
          shieldingDone: 0,
          crowdControlApplications: 1,
          crowdControlDuration: 3,
          actionsLost: 1,
        },
      },
    });
    expect(events).toEqual(original);
  });

  it('returns zeroed metrics for an empty or unrelated stream', () => {
    expect(reduceBattleMetrics([])).toEqual(createEmptyBattleMetrics());
    expect(
      reduceBattleMetrics([
        { type: 'turn_start', champion: 'Garen', side: 'player', turnIndex: 0 },
      ]),
    ).toEqual(createEmptyBattleMetrics());
  });
});
