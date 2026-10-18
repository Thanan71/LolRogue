import { describe, expect, it } from 'vitest';
import { assertDeployableMigrationHistory } from '../scripts/lib/migration-manifest.mjs';

describe('remote migration deployment preflight', () => {
  const candidate = ['20260101000000', '20260102000000', '20260103000000'];

  it('accepts only an already-applied prefix and lists pending migrations', () => {
    expect(assertDeployableMigrationHistory(candidate, [])).toEqual({
      applied: 0,
      pending: candidate,
    });
    expect(assertDeployableMigrationHistory(candidate, candidate.slice(0, 2))).toEqual({
      applied: 2,
      pending: ['20260103000000'],
    });
    expect(assertDeployableMigrationHistory(candidate, candidate)).toEqual({
      applied: 3,
      pending: [],
    });
  });

  it.each([
    [['20260102000000'], 'skipped first migration'],
    [['20260101000000', '20260103000000'], 'gap inside deployed history'],
    [['20260102000000', '20260101000000'], 'unexpected ordering'],
    [['20260101000000', '20260101000000'], 'duplicate history entry'],
    [['20260101000000', '20260104000000'], 'migration unknown to this candidate'],
  ])('rejects %s (%s)', (applied) => {
    expect(() => assertDeployableMigrationHistory(candidate, applied)).toThrow(
      'Remote migrations do not form a known prefix',
    );
  });
});
