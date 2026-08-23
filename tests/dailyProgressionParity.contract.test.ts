import { describe, expect, it } from 'vitest';
import { implementedChampions } from '@/data/champion';
import {
  createAuthorityReplaySession,
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  verifyAuthorityRun,
} from '@/game/authority';
import { survivalGreedyPolicy } from '@/game/balance/balancePolicy';
import { enhancementTreeProvider } from '@/services/enhancementService';

function maxedAccountSnapshots(): Pick<
  AuthorityRunAttempt,
  'enhancementSnapshot' | 'masterySnapshot'
> {
  return {
    masterySnapshot: Object.fromEntries(implementedChampions.map((champion) => [champion.id, 4])),
    enhancementSnapshot: Object.fromEntries(
      implementedChampions.map((champion) => {
        const tree = enhancementTreeProvider.getTreeForChampion(champion);
        const nodes = [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)];
        return [
          champion.id,
          Object.fromEntries(nodes.map((node) => [node.id, node.maxRanks ?? 1])),
        ];
      }),
    ),
  };
}

function terminalTrace(attempt: AuthorityRunAttempt): AuthorityRunCommand[] {
  const session = createAuthorityReplaySession(attempt);
  const trace: AuthorityRunCommand[] = [];
  for (let guard = 0; guard < 400; guard++) {
    const snapshot = session.getResult().snapshot;
    if (snapshot.terminal) return trace;
    const next = survivalGreedyPolicy.nextCommand(snapshot);
    if (!next) throw new Error('Daily policy stopped before reaching a terminal score.');
    trace.push(structuredClone(next));
    session.append(next);
  }
  throw new Error('Daily contract did not terminate within 400 commands.');
}

function scoreV14(snapshot: {
  won: boolean;
  totalWavesCompleted: number;
  biomesVisited: readonly unknown[];
  runLevel: number;
  ledger: { gold: { earned: number } };
}): number {
  return (
    (snapshot.won ? 10_000 : 0) +
    snapshot.totalWavesCompleted * 1_000 +
    snapshot.biomesVisited.length * 250 +
    snapshot.runLevel * 100 +
    snapshot.ledger.gold.earned
  );
}

describe('official Daily account progression parity', () => {
  it('gives a new and a maxed account the exact same terminal score for one seed and trace', () => {
    const newAccount: AuthorityRunAttempt = {
      runUuid: '16161616-1616-4616-8616-161616161616',
      seed: 42_4242,
      difficulty: 'normal',
      mode: 'daily',
      team: [{ championId: 'Garen' }],
      runeIds: [],
      enhancementSnapshot: {},
      masterySnapshot: {},
    };
    const maxedAccount: AuthorityRunAttempt = {
      ...newAccount,
      ...maxedAccountSnapshots(),
    };
    const commands = terminalTrace(newAccount);

    const newResult = verifyAuthorityRun(newAccount, commands, { requireTerminal: true });
    const maxedResult = verifyAuthorityRun(maxedAccount, commands, { requireTerminal: true });

    expect(Object.keys(maxedAccount.masterySnapshot)).toHaveLength(implementedChampions.length);
    expect(
      Object.values(maxedAccount.enhancementSnapshot).every(
        (nodes) => Object.keys(nodes).length > 0,
      ),
    ).toBe(true);
    expect(commands.length).toBeGreaterThan(0);
    expect(newResult).toMatchObject({ ok: true, result: { snapshot: { terminal: true } } });
    expect(maxedResult).toEqual(newResult);
    if (!newResult.ok || !maxedResult.ok) {
      throw new Error('Daily parity trace must verify for both progression profiles.');
    }
    expect(scoreV14(maxedResult.result.snapshot)).toBe(scoreV14(newResult.result.snapshot));
    expect(scoreV14(newResult.result.snapshot)).toBeGreaterThan(0);
  });
});
