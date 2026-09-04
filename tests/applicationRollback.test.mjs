import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertRollbackCompatibleMigrationManifest,
  readCandidateMigrationVersions,
  readWorkspaceMigrationVersions,
} from '../scripts/lib/migration-manifest.mjs';

const contract = JSON.parse(
  readFileSync(new URL('../config/application-rollback.json', import.meta.url), 'utf8'),
);

describe('application rollback contract', () => {
  it('pointe vers un client compatible dont le manifeste est égal au schéma ou son préfixe', () => {
    const rollbackVersions = readCandidateMigrationVersions(contract.applicationSha);
    const currentVersions = readWorkspaceMigrationVersions();
    const compatibility = assertRollbackCompatibleMigrationManifest(
      rollbackVersions,
      currentVersions,
    );

    expect(compatibility).toMatchObject({
      rollbackLatest: contract.lastApplicationMigrationVersion,
      currentLatest: contract.requiredCurrentMigrationVersion,
    });
    expect(compatibility.appendedVersions).toEqual([]);
  });

  it('refuse un rollback lorsque les historiques divergent', () => {
    expect(() =>
      assertRollbackCompatibleMigrationManifest(
        ['20260101000000', '20260103000000'],
        ['20260101000000', '20260102000000', '20260103000000'],
      ),
    ).toThrow('neither equal to nor an append-only extension');
  });

  it('accepte un rollback applicatif compatible avec un schéma identique', () => {
    expect(
      assertRollbackCompatibleMigrationManifest(
        ['20260101000000', '20260102000000'],
        ['20260101000000', '20260102000000'],
      ),
    ).toMatchObject({
      rollbackLatest: '20260102000000',
      currentLatest: '20260102000000',
      appendedVersions: [],
    });
  });
});
