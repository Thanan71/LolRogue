import { describe, expect, it, vi } from 'vitest';
import {
  type AuthorityRunVerificationError,
  parseRunCommand,
} from '@/game/authority/RunCommandValidator';
import { BattleEventJournal } from '@/game/battle/BattleEventJournal';
import { BattlePhase } from '@/game/battle/types';
import { serializeRunCommand } from '@/game/run/runAuthorityJournal';

describe('responsibility boundaries', () => {
  it('parses authority commands without constructing the replay engine', () => {
    expect(
      parseRunCommand({ sequence: 1, kind: 'resolve_combat', payload: { node_id: 'node_1' } }, 0),
    ).toEqual({
      sequence: 1,
      kind: 'resolve_combat',
      payload: { node_id: 'node_1', actions_json: 'auto' },
    });

    expect(() =>
      parseRunCommand(
        {
          sequence: 1,
          kind: 'move_node',
          payload: { node_id: 'node_1', forged: 'value' },
        },
        4,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AuthorityRunVerificationError>>({
        code: 'invalid_command',
        commandIndex: 4,
      }),
    );
  });

  it('serializes client commands without depending on Zustand', () => {
    expect(
      serializeRunCommand({
        kind: 'shop_buy_item',
        nodeId: 'shop_1',
        itemId: 'long_sword',
      }),
    ).toEqual({ node_id: 'shop_1', item_id: 'long_sword' });
  });

  it('owns battle events and derives an immutable terminal result', () => {
    const journal = new BattleEventJournal();
    const listener = vi.fn();
    journal.subscribe(listener);
    journal.append({ type: 'battle_end', winner: 'player', rounds: 3 });

    expect(listener).toHaveBeenCalledOnce();
    expect(journal.result(BattlePhase.TurnActive)).toBeNull();
    const result = journal.result(BattlePhase.Finished);
    expect(result).toEqual({
      winner: 'player',
      totalRounds: 3,
      log: [{ type: 'battle_end', winner: 'player', rounds: 3 }],
      metrics: {
        rounds: 3,
        bySide: {
          player: {
            hpDamageDealt: 0,
            shieldDamageDealt: 0,
            healingDone: 0,
            overhealing: 0,
            shieldingDone: 0,
            crowdControlApplications: 0,
            crowdControlDuration: 0,
            actionsLost: 0,
          },
          enemy: {
            hpDamageDealt: 0,
            shieldDamageDealt: 0,
            healingDone: 0,
            overhealing: 0,
            shieldingDone: 0,
            crowdControlApplications: 0,
            crowdControlDuration: 0,
            actionsLost: 0,
          },
        },
      },
    });

    result?.log.push({ type: 'battle_end', winner: 'enemy', rounds: 4 });
    expect(journal.read()).toHaveLength(1);
    journal.unsubscribe(listener);
    journal.append({ type: 'battle_end', winner: 'draw', rounds: 5 });
    expect(listener).toHaveBeenCalledOnce();
  });
});
