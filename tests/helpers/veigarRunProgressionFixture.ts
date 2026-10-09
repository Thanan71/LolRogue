import {
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  createAuthorityReplaySession,
} from '@/game/authority';
import { canUpgradeSpell } from '@/game/run/spellUpgradeRules';

/** Local, deterministic combat replay; no account, network or client-supplied counter values. */
export const VEIGAR_FIRST_COMBAT_ATTEMPT: AuthorityRunAttempt = {
  runUuid: '11111111-1111-4111-8111-111111111111',
  seed: 0,
  difficulty: 'easy',
  mode: 'normal',
  team: [{ championId: 'Veigar' }, { championId: 'Garen' }],
  runeIds: [],
  enhancementSnapshot: {},
  masterySnapshot: {},
};

export const VEIGAR_FIRST_COMBAT_COMMANDS: AuthorityRunCommand[] = [
  { sequence: 1, kind: 'move_node', payload: { node_id: 'node_top_lane_0' } },
  {
    sequence: 2,
    kind: 'resolve_combat',
    payload: { node_id: 'node_top_lane_0', actions_json: 'auto' },
  },
];

/** Strong deterministic team traverses a whole biome so lifecycle tests include the real exit. */
export function createVeigarBiomeReplayFixture() {
  const attempt: AuthorityRunAttempt = {
    ...VEIGAR_FIRST_COMBAT_ATTEMPT,
    seed: 2,
    team: [{ championId: 'Veigar', statMultiplier: 10 }],
  };
  const session = createAuthorityReplaySession(attempt);
  const commands: AuthorityRunCommand[] = [];
  const append = (command: Omit<AuthorityRunCommand, 'sequence'>) => {
    const sequenced = { ...command, sequence: commands.length + 1 } as AuthorityRunCommand;
    session.append(sequenced);
    commands.push(sequenced);
  };
  for (let guard = 0; guard < 100; guard++) {
    const result = session.getResult();
    const snapshot = result.snapshot;
    if (snapshot.currentBiomeIndex === 1) return { attempt, commands, result };
    if (snapshot.terminal)
      throw new Error('The deterministic Veigar team ended before biome exit.');
    const championId = snapshot.pendingSpellUpgradeChampionIds[0];
    if (championId) {
      const member = snapshot.team.find((candidate) => candidate.championId === championId)!;
      const slot = (['Q', 'W', 'E', 'R'] as const).find((candidate) =>
        canUpgradeSpell(member, candidate),
      );
      if (!slot) throw new Error('No legal spell upgrade remains.');
      append({ kind: 'upgrade_spell', payload: { champion_id: championId, slot } });
      continue;
    }
    if (snapshot.pendingAugmentIds[0]) {
      append({ kind: 'choose_augment', payload: { augment_id: snapshot.pendingAugmentIds[0] } });
      continue;
    }
    const pending = snapshot.pendingEncounter;
    if (pending) {
      if (['combat', 'elite', 'boss'].includes(pending.nodeType)) {
        append({
          kind: 'resolve_combat',
          payload: { node_id: pending.nodeId, actions_json: 'auto' },
        });
      } else if (pending.nodeType === 'treasure') {
        append({ kind: 'treasure', payload: { node_id: pending.nodeId } });
      }
      append({ kind: 'resolve_node', payload: { node_id: pending.nodeId } });
      continue;
    }
    append({ kind: 'move_node', payload: { node_id: snapshot.expectedNodeIds[0]! } });
  }
  throw new Error('The deterministic Veigar replay exceeded its safety bound.');
}
