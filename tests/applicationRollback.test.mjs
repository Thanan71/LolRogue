import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertRollbackAuthorityCompatibility,
  assertRollbackMigrationContents,
} from '../scripts/lib/application-rollback-contract.mjs';
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
    expect(assertRollbackMigrationContents(contract.applicationSha, process.cwd())).toEqual({
      migrationCount: rollbackVersions.length,
    });

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

  it('connaît le moteur actif, son catalogue et ses capacités de progression de run', () => {
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

    expect(current.gameplay).toBeGreaterThanOrEqual(23);
    expect(compatible).toMatchObject({
      engine: current.engine,
      gameplay: current.gameplay,
      contentHash: current.contentHash,
      championCatalog: current.championCatalog,
      features: {
        manualCombat: true,
        canonicalEncounters: true,
        runProgression: true,
        runProgressionAssists: true,
      },
    });
    expect(['current', 'replay-only']).toContain(compatible.status);
    expect(assertRollbackAuthorityCompatibility(rollbackRegistry, currentRegistry)).toMatchObject({
      engine: current.engine,
      contentHash: current.contentHash,
      progression: current.progression,
      championCatalog: current.championCatalog,
    });
  });

  it('refuse des migrations réécrites même lorsque les versions sont identiques', () => {
    const root = mkdtempSync(join(tmpdir(), 'rollback-sql-content-'));
    try {
      mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
      const path = join(root, 'supabase/migrations/20260101000000_contract.sql');
      writeFileSync(path, 'SELECT 1;\n');
      execFileSync('git', ['-c', 'init.defaultBranch=fixture', 'init', '--quiet'], { cwd: root });
      execFileSync('git', ['add', '--all'], { cwd: root });
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.test',
          'commit',
          '--quiet',
          '-m',
          'immutable SQL fixture',
        ],
        { cwd: root },
      );
      const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
      expect(assertRollbackMigrationContents(sha, root)).toEqual({ migrationCount: 1 });
      writeFileSync(path, 'SELECT 2;\n');
      expect(() => assertRollbackMigrationContents(sha, root)).toThrow(
        'migration content diverges',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['contentHash', 'progression', 'command', 'dailyScore', 'championCatalog'])(
    'refuse un client dont %s ne correspond pas à l’autorité active',
    (field) => {
      const current = JSON.parse(
        readFileSync(new URL('../config/authority-versions.json', import.meta.url), 'utf8'),
      );
      const candidate = structuredClone(current);
      const active = candidate.versions.find((entry) => entry.status === 'current');
      active[field] = field === 'contentHash' ? '0'.repeat(64) : active[field] + 1;
      expect(() => assertRollbackAuthorityCompatibility(candidate, current)).toThrow(
        'exact active authority',
      );
    },
  );

  it('refuse un moteur historique non pris en charge ou une capacité manquante', () => {
    const current = JSON.parse(
      readFileSync(new URL('../config/authority-versions.json', import.meta.url), 'utf8'),
    );
    const unsupported = structuredClone(current);
    unsupported.versions.find((entry) => entry.status === 'current').status = 'unsupported';
    expect(() => assertRollbackAuthorityCompatibility(unsupported, current)).toThrow(
      'exact active authority',
    );
    const incomplete = structuredClone(current);
    incomplete.versions.find((entry) => entry.status === 'current').features.runProgressionAssists =
      false;
    expect(() => assertRollbackAuthorityCompatibility(incomplete, current)).toThrow(
      'exact active authority',
    );
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
