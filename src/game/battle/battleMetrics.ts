import type { BattleEvent, BattleMetrics, BattleSideMetrics, TeamSide } from './types';

function emptySideMetrics(): BattleSideMetrics {
  return {
    hpDamageDealt: 0,
    shieldDamageDealt: 0,
    healingDone: 0,
    overhealing: 0,
    shieldingDone: 0,
    shieldingAbsorbed: 0,
    manaSpent: 0,
    crowdControlApplications: 0,
    crowdControlDuration: 0,
    actionsLost: 0,
  };
}

export function createEmptyBattleMetrics(): BattleMetrics {
  return {
    rounds: 0,
    bySide: {
      player: emptySideMetrics(),
      enemy: emptySideMetrics(),
    },
  };
}

function nonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sideMetrics(metrics: BattleMetrics, side: TeamSide): BattleSideMetrics {
  return metrics.bySide[side];
}

/** Derives deterministic aggregate observability from the immutable battle event stream. */
export function reduceBattleMetrics(events: readonly BattleEvent[]): BattleMetrics {
  const metrics = createEmptyBattleMetrics();

  for (const event of events) {
    switch (event.type) {
      case 'round_start':
        metrics.rounds = Math.max(metrics.rounds, nonNegative(event.round));
        break;
      case 'battle_end':
        metrics.rounds = Math.max(metrics.rounds, nonNegative(event.rounds));
        break;
      case 'damage': {
        const source = sideMetrics(metrics, event.sourceSide);
        const shieldDamage = nonNegative(event.shieldDamage);
        source.shieldDamageDealt += shieldDamage;
        source.hpDamageDealt += nonNegative(event.hpDamage ?? event.amount - shieldDamage);
        for (const side of ['player', 'enemy'] as const) {
          sideMetrics(metrics, side).shieldingAbsorbed += nonNegative(
            event.shieldAbsorbedBySide?.[side],
          );
        }
        break;
      }
      case 'action_select':
        sideMetrics(metrics, event.side).manaSpent += nonNegative(event.manaSpent);
        break;
      case 'heal': {
        const source = sideMetrics(metrics, event.sourceSide);
        source.healingDone += nonNegative(event.amount);
        source.overhealing += nonNegative(event.overheal);
        break;
      }
      case 'shield':
        if (event.countsAsShield !== false) {
          sideMetrics(metrics, event.sourceSide).shieldingDone += nonNegative(event.amount);
        }
        break;
      case 'crowd_control_applied': {
        const source = sideMetrics(metrics, event.sourceSide);
        source.crowdControlApplications++;
        source.crowdControlDuration += nonNegative(event.duration);
        break;
      }
      case 'turn_skipped':
        sideMetrics(metrics, event.side).actionsLost++;
        break;
      default:
        break;
    }
  }

  return metrics;
}
