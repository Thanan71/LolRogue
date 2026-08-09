import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertAppendOnlyRollbackManifest,
  readCandidateMigrationVersions,
  readWorkspaceMigrationVersions,
} from '../scripts/lib/migration-manifest.mjs';

const contract = JSON.parse(
  readFileSync(new URL('../config/application-rollback.json', import.meta.url), 'utf8'),
);

describe('application rollback contract', () => {
  it('pointe vers un ancien client dont le manifeste est un préfixe strict du schéma actuel', () => {
    const rollbackVersions = readCandidateMigrationVersions(contract.applicationSha);
    const currentVersions = readWorkspaceMigrationVersions();
    const compatibility = assertAppendOnlyRollbackManifest(rollbackVersions, currentVersions);

    expect(compatibility).toMatchObject({
      rollbackLatest: contract.lastApplicationMigrationVersion,
      currentLatest: contract.requiredCurrentMigrationVersion,
    });
    expect(compatibility.appendedVersions.length).toBeGreaterThan(0);
  });

  it('refuse un rollback lorsque les historiques divergent', () => {
    expect(() =>
      assertAppendOnlyRollbackManifest(
        ['20260101000000', '20260103000000'],
        ['20260101000000', '20260102000000', '20260103000000'],
      ),
    ).toThrow('not an append-only extension');
  });
});
