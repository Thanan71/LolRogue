import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  compareMigrationManifests,
  parseSupabaseMigrationList,
  readCandidateMigrationVersions,
  readOnlyMigrationListArguments,
  readWorkspaceMigrationVersions,
} from '../scripts/lib/migration-manifest.mjs';

describe('candidate migration manifest', () => {
  it('borne le check à la commande Supabase de lecture seule', () => {
    expect(readOnlyMigrationListArguments(true)).toEqual(['migration', 'list', '--linked']);
    expect(readOnlyMigrationListArguments(false)).toEqual(['migration', 'list', '--local']);
    for (const forbidden of ['down', 'fetch', 'new', 'repair', 'squash', 'up']) {
      expect(readOnlyMigrationListArguments(true)).not.toContain(forbidden);
    }
  });

  it('lit les migrations depuis le commit candidat plutôt que depuis le seul workspace', () => {
    const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();

    expect(readCandidateMigrationVersions(candidateSha)).toEqual(readWorkspaceMigrationVersions());
  });

  it('conserve aussi une migration présente uniquement sur le projet live', () => {
    const migrations = parseSupabaseMigrationList(`
      LOCAL          │ REMOTE         │ TIME (UTC)
      20260101000000 │ 20260101000000 │ 2026-01-01
                     │ 20260102000000 │ 2026-01-02
    `);

    expect(migrations).toEqual([
      { local: '20260101000000', remote: '20260101000000' },
      { local: '', remote: '20260102000000' },
    ]);
  });

  it('distingue migration manquante, migration inconnue et ordre divergent', () => {
    const expected = ['20260101000000', '20260102000000', '20260103000000'];

    expect(compareMigrationManifests(expected, ['20260101000000', '20260103000000'])).toMatchObject(
      {
        missing: ['20260102000000'],
        unknown: [],
        orderDivergent: false,
      },
    );
    expect(
      compareMigrationManifests(expected, [
        '20260101000000',
        '20260102000000',
        '20260103000000',
        '20260104000000',
      ]),
    ).toMatchObject({ missing: [], unknown: ['20260104000000'], orderDivergent: false });
    expect(
      compareMigrationManifests(expected, ['20260102000000', '20260101000000', '20260103000000']),
    ).toMatchObject({ missing: [], unknown: [], orderDivergent: true });
  });
});
