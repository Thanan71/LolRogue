import { describe, expect, it } from 'vitest';
import type { BattleEvent } from '@/game/battle/types';
import { CCType } from '@/game/effects/types';
import {
  buildRunSummaryFromLedger,
  commitCombatEvents,
  createRunLedger,
  recordGoldGain,
  recordGoldSpend,
  recordItemLedgerEvent,
} from '@/game/run/runLedger';

const TEAM = ['Garen', 'Lux', 'Soraka'] as const;

function refresh<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('versioned run ledger', () => {
  it('keeps the exact golden summary after three combats and a refresh', () => {
    let ledger = createRunLedger(TEAM);

    const fightOne: BattleEvent[] = [
      {
        type: 'damage',
        source: 'Garen',
        target: 'Darius',
        targetCombatantId: 'enemy-1',
        amount: 100,
        hpDamage: 90,
        shieldDamage: 10,
        overkillDamage: 30,
        isCrit: false,
        sourceSide: 'player',
        targetSide: 'enemy',
      },
      {
        type: 'damage',
        source: 'Lux',
        target: 'Darius',
        targetCombatantId: 'enemy-1',
        amount: 30,
        hpDamage: 30,
        shieldDamage: 0,
        isCrit: false,
        sourceSide: 'player',
        targetSide: 'enemy',
      },
      {
        type: 'defeat',
        champion: 'Darius',
        combatantId: 'enemy-1',
        side: 'enemy',
        defeatedBy: 'Garen',
      },
      {
        type: 'heal',
        source: 'Soraka',
        target: 'Garen',
        amount: 20,
        overheal: 5,
        sourceSide: 'player',
        targetSide: 'player',
      },
      {
        type: 'shield',
        source: 'Soraka',
        target: 'Lux',
        amount: 40,
        sourceSide: 'player',
        targetSide: 'player',
      },
      {
        type: 'crowd_control_applied',
        source: 'Lux',
        target: 'Darius',
        sourceSide: 'player',
        targetSide: 'enemy',
        ccType: CCType.Stun,
        duration: 1,
      },
      {
        type: 'turn_skipped',
        champion: 'Darius',
        side: 'enemy',
        round: 1,
        turnIndex: 2,
        reason: 'hard_crowd_control',
        crowdControlTypes: [CCType.Stun],
      },
      {
        type: 'damage',
        source: 'Darius',
        target: 'Lux',
        amount: 40,
        hpDamage: 25,
        shieldDamage: 15,
        shieldAbsorbedBySource: { Soraka: 15 },
        isCrit: false,
        sourceSide: 'enemy',
        targetSide: 'player',
      },
    ];
    ledger = refresh(commitCombatEvents(ledger, fightOne, TEAM));

    const fightTwo: BattleEvent[] = [
      {
        type: 'damage',
        source: 'Lux',
        target: 'Annie',
        targetCombatantId: 'enemy-2',
        amount: 50,
        hpDamage: 50,
        shieldDamage: 0,
        isCrit: false,
        sourceSide: 'player',
        targetSide: 'enemy',
      },
      {
        type: 'defeat',
        champion: 'Annie',
        combatantId: 'enemy-2',
        side: 'enemy',
        defeatedBy: 'Lux',
      },
      {
        type: 'damage',
        source: 'Annie',
        target: 'Garen',
        amount: 40,
        hpDamage: 40,
        shieldDamage: 0,
        isCrit: false,
        sourceSide: 'enemy',
        targetSide: 'player',
      },
    ];
    ledger = refresh(commitCombatEvents(ledger, fightTwo, TEAM));

    const fightThree: BattleEvent[] = [
      {
        type: 'damage',
        source: 'Garen',
        target: 'Malphite',
        targetCombatantId: 'enemy-3',
        amount: 100,
        hpDamage: 100,
        shieldDamage: 0,
        isCrit: true,
        sourceSide: 'player',
        targetSide: 'enemy',
      },
      {
        type: 'defeat',
        champion: 'Malphite',
        combatantId: 'enemy-3',
        side: 'enemy',
        defeatedBy: 'Garen',
      },
      { type: 'defeat', champion: 'Lux', side: 'player' },
    ];
    ledger = refresh(commitCombatEvents(ledger, fightThree, TEAM));

    ledger = recordGoldGain(ledger, 200);
    ledger = recordGoldSpend(ledger, 75);
    ledger = recordItemLedgerEvent(ledger, {
      action: 'found',
      itemId: 'long_sword',
      instanceId: 'item-1',
      context: { source: 'combat', nodeId: 'fight-3', wave: 3 },
    });
    ledger = recordItemLedgerEvent(ledger, {
      action: 'equipped',
      itemId: 'long_sword',
      instanceId: 'item-1',
      championId: 'Garen',
      context: { source: 'inventory', wave: 3 },
    });

    const summary = buildRunSummaryFromLedger({
      ledger: refresh(ledger),
      team: [
        { championId: 'Garen', currentHp: 60 },
        { championId: 'Lux', currentHp: 0 },
        { championId: 'Soraka', currentHp: 100 },
      ],
      won: true,
      wavesCompleted: 3,
      biomesVisited: ['top_lane'],
      goldBalance: 125,
      runLevel: 1,
    });

    expect(summary).toEqual({
      won: true,
      wavesCompleted: 3,
      biomesVisited: ['top_lane'],
      totalKills: 3,
      totalDamage: 270,
      goldEarned: 200,
      goldSpent: 75,
      goldBalance: 125,
      runLevel: 1,
      itemEvents: [
        {
          sequence: 1,
          action: 'found',
          source: 'combat',
          itemId: 'long_sword',
          instanceId: 'item-1',
          championId: null,
          goldAmount: 0,
          nodeId: 'fight-3',
          wave: 3,
        },
        {
          sequence: 2,
          action: 'equipped',
          source: 'inventory',
          itemId: 'long_sword',
          instanceId: 'item-1',
          championId: 'Garen',
          goldAmount: 0,
          nodeId: null,
          wave: 3,
        },
      ],
      championStats: [
        {
          championId: 'Garen',
          kills: 2,
          assists: 0,
          totalDamage: 190,
          damageToShields: 10,
          damageReceived: 40,
          healingDone: 0,
          healingReceived: 20,
          overhealing: 0,
          shieldingDone: 0,
          shieldingAbsorbed: 0,
          deaths: 0,
          itemsCollected: ['long_sword'],
          survived: true,
        },
        {
          championId: 'Lux',
          kills: 1,
          assists: 1,
          totalDamage: 80,
          damageToShields: 0,
          damageReceived: 25,
          healingDone: 0,
          healingReceived: 0,
          overhealing: 0,
          shieldingDone: 0,
          shieldingAbsorbed: 0,
          deaths: 1,
          itemsCollected: [],
          survived: false,
        },
        {
          championId: 'Soraka',
          kills: 0,
          assists: 0,
          totalDamage: 0,
          damageToShields: 0,
          damageReceived: 0,
          healingDone: 20,
          healingReceived: 0,
          overhealing: 5,
          shieldingDone: 40,
          shieldingAbsorbed: 15,
          deaths: 0,
          itemsCollected: [],
          survived: true,
        },
      ],
    });
  });
});
