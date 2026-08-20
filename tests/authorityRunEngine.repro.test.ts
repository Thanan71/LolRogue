import { describe, expect, it } from 'vitest';
import {
  replayAuthorityRun,
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  verifyAuthorityRun,
} from '../src/game/authority';

const attempt: AuthorityRunAttempt = {
  runUuid: '55555555-5555-4555-8555-555555555555',
  seed: 2_116_951_237,
  difficulty: 'easy',
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
      actions_json:
        '[["r","Warwick",1],["e",null,1],["w",null,1],["e",null,1],["q","Warwick",1],["a","Warwick",1],["a","Warwick",1],["a","Warwick",1],["a","Warwick",1],["a","Warwick",1],["a","Warwick",1]]',
    },
  },
  { sequence: 3, kind: 'resolve_node', payload: { node_id: 'node_top_lane_0' } },
  { sequence: 4, kind: 'move_node', payload: { node_id: 'node_top_lane_3' } },
  { sequence: 5, kind: 'event', payload: { node_id: 'node_top_lane_3' } },
  { sequence: 6, kind: 'resolve_node', payload: { node_id: 'node_top_lane_3' } },
  { sequence: 7, kind: 'move_node', payload: { node_id: 'node_top_lane_4' } },
  { sequence: 8, kind: 'event', payload: { node_id: 'node_top_lane_4' } },
  { sequence: 9, kind: 'resolve_node', payload: { node_id: 'node_top_lane_4' } },
  { sequence: 10, kind: 'move_node', payload: { node_id: 'node_top_lane_7' } },
  {
    sequence: 11,
    kind: 'resolve_combat',
    payload: {
      node_id: 'node_top_lane_7',
      actions_json:
        '[["e",null,1],["a","Darius",1],["a","Darius",1],["a","Darius",1],["a","Darius",1],["a","Darius",1],["a","Darius",1],["a","Darius",1],["a","Darius",1]]',
    },
  },
  { sequence: 12, kind: 'resolve_node', payload: { node_id: 'node_top_lane_7' } },
  { sequence: 13, kind: 'move_node', payload: { node_id: 'node_top_lane_10' } },
  {
    sequence: 14,
    kind: 'resolve_combat',
    payload: {
      node_id: 'node_top_lane_10',
      actions_json:
        '[["r","Warwick",1],["a","Warwick",1],["a","Warwick",1],["a","Warwick",1],["a","Warwick",1],["a","Warwick",1],["a","Warwick",1],["a","Warwick",1]]',
    },
  },
  { sequence: 15, kind: 'resolve_node', payload: { node_id: 'node_top_lane_10' } },
  { sequence: 16, kind: 'move_node', payload: { node_id: 'node_top_lane_11' } },
  { sequence: 17, kind: 'resolve_node', payload: { node_id: 'node_top_lane_11' } },
  { sequence: 18, kind: 'choose_augment', payload: { augment_id: 'field_medic' } },
  { sequence: 19, kind: 'move_node', payload: { node_id: 'node_jungle_0' } },
  {
    sequence: 20,
    kind: 'resolve_combat',
    payload: {
      node_id: 'node_jungle_0',
      actions_json: '[["e",null,1],["a","Malphite#1",1]]',
    },
  },
];

describe('combat action trace replay regression', () => {
  it('does not consume a phantom action after an exact automatic trace', () => {
    const before = replayAuthorityRun(attempt, commands.slice(0, -1)).snapshot;
    expect(before).toMatchObject({
      currentNodeId: 'node_jungle_0',
      runLevel: 2,
      augmentIds: ['field_medic'],
    });

    expect(verifyAuthorityRun(attempt, commands)).toMatchObject({
      ok: true,
    });
  });
});
