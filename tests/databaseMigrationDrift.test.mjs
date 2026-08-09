import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  readCandidateMigrationVersions,
  readWorkspaceMigrationVersions,
} from '../scripts/lib/migration-manifest.mjs';

describe('candidate migration manifest', () => {
  it('lit les migrations depuis le commit candidat plutôt que depuis le seul workspace', () => {
    const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();

    expect(readCandidateMigrationVersions(candidateSha)).toEqual(readWorkspaceMigrationVersions());
  });
});
