import { execFileSync } from 'node:child_process';
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
    if (compatibility.rollbackLatest === compatibility.currentLatest) {
      expect(compatibility.appendedVersions).toEqual([]);
    } else {
      expect(compatibility.appendedVersions.at(-1)).toBe(contract.requiredCurrentMigrationVersion);
    }
  });

  it('connaît le moteur actif v22, son catalogue et sa progression de run', () => {
    const currentRegistry = JSON.parse(
      readFileSync(new URL('../config/authority-versions.json', import.meta.url), 'utf8'),
    );
    const rollbackRegistry = JSON.parse(
      execFileSync('git', ['show', `${contract.applicationSha}:config/authority-versions.json`], {
        encoding: 'utf8',
      }),
    );
    const current = currentRegistry.versions.find((version) => version.status === 'current');
    const compatible = rollbackRegistry.versions.find(
      (version) => version.engine === current.engine,
    );

    expect(current.gameplay).toBeGreaterThanOrEqual(22);
    expect(compatible).toMatchObject({
      engine: current.engine,
      gameplay: current.gameplay,
      contentHash: current.contentHash,
      championCatalog: current.championCatalog,
      features: { manualCombat: true, canonicalEncounters: true, runProgression: true },
    });
    expect(['current', 'replay-only']).toContain(compatible.status);
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
