import { describe, expect, it } from 'vitest';
import {
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  replayAuthorityRun,
  verifyAuthorityRun,
} from '../src/game/authority';

const attempt: AuthorityRunAttempt = {
  runUuid: '55555555-5555-4555-8555-555555555555',
  seed: 2_116_951_237,
  difficulty: 'easy',
  mode: 'normal',
  team: [{ championId: 'Warwick' }],
  runeIds: ['press_the_attack', 'glacial_augment', 'grasp_of_the_undying'],
  // This fixture targets trace consumption, not enhancement math. v12 now
  // applies fighter_core_1 correctly, which intentionally changes turn count.
  enhancementSnapshot: { Warwick: {} },
  masterySnapshot: { Warwick: 1 },
};

const commands: AuthorityRunCommand[] = [
  { sequence: 1, kind: 'move_node', payload: { node_id: 'node_top_lane_0' } },
  {
    sequence: 2,
    kind: 'resolve_combat',
    payload: {
      node_id: 'node_top_lane_0',
      actions_json: '[["q","Warwick",1],["q","Warwick",1]]',
    },
  },
  { sequence: 3, kind: 'resolve_node', payload: { node_id: 'node_top_lane_0' } },
  { sequence: 4, kind: 'move_node', payload: { node_id: 'node_top_lane_1' } },
  {
    sequence: 5,
    kind: 'resolve_combat',
    payload: {
      node_id: 'node_top_lane_1',
      actions_json: '[["q","Darius",1],["w",null,1],["q","Darius",1],["r","Darius",1]]',
    },
  },
  { sequence: 6, kind: 'resolve_node', payload: { node_id: 'node_top_lane_1' } },
  { sequence: 7, kind: 'move_node', payload: { node_id: 'node_top_lane_4' } },
  {
    sequence: 8,
    kind: 'resolve_combat',
    payload: {
      node_id: 'node_top_lane_4',
      actions_json: '[["q","Garen",1],["a","Garen",1],["a","Garen",1],["a","Garen",1]]',
    },
  },
];

describe('combat action trace replay regression', () => {
  it('does not consume a phantom action after an exact automatic trace', () => {
    const before = replayAuthorityRun(attempt, commands.slice(0, -1)).snapshot;
    expect(before).toMatchObject({
      currentNodeId: 'node_top_lane_4',
      runLevel: 1,
      augmentIds: [],
    });

    const verification = verifyAuthorityRun(attempt, commands, { requireTerminal: false });
    expect(verification).toMatchObject({
      ok: true,
      result: {
        snapshot: { currentNodeId: 'node_top_lane_4', terminal: false, endReason: null },
      },
    });
  });
});
