import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const script = resolve(root, 'scripts/release-preflight.mjs');
const temporaryDirectories: string[] = [];

const runPreflight = (sheetPath: string, documentationPath: string, ...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      RELEASE_SHEET_PATH: sheetPath,
      RELEASE_READINESS_PATH: documentationPath,
    },
  });

const fixture = () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'lolrogue-release-'));
  temporaryDirectories.push(directory);
  const sheetPath = resolve(directory, 'release.json');
  const documentationPath = resolve(directory, 'readiness.md');
  writeFileSync(sheetPath, readFileSync(resolve(root, 'config/beta-release.json')));
  writeFileSync(documentationPath, '<!-- release-readiness:status=blocked -->');
  return { sheetPath, documentationPath };
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release preflight', () => {
  it('reste bloquant lorsque les preuves du candidat manquent', () => {
    const { sheetPath, documentationPath } = fixture();
    const result = runPreflight(sheetPath, documentationPath);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Beta release preflight: BLOCKED');
    expect(result.stdout).toContain('[candidate-sha]');
    expect(result.stdout).toContain('[ci-count]');
    expect(result.stdout).toContain('[external-validation]');
  });

  it('signale précisément un P0 rouvert sans lire les cases du TODO', () => {
    const { sheetPath, documentationPath } = fixture();
    const sheet = JSON.parse(readFileSync(sheetPath, 'utf8'));
    sheet.p0Gates[0].status = 'open';
    writeFileSync(sheetPath, JSON.stringify(sheet));

    const result = runPreflight(sheetPath, documentationPath);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('[p0] P0-SEC-01 reste ouvert');
  });

  it('refuse de compter plusieurs fois le même run CI', () => {
    const { sheetPath, documentationPath } = fixture();
    const sheet = JSON.parse(readFileSync(sheetPath, 'utf8'));
    sheet.ciRuns = [1, 2, 3].map(() => ({ runId: 123, url: 'https://github.com/run/123' }));
    writeFileSync(sheetPath, JSON.stringify(sheet));

    const result = runPreflight(sheetPath, documentationPath);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('[ci-duplicate]');
  });

  it('échoue lorsque la documentation affiche un état vert contradictoire', () => {
    const { sheetPath, documentationPath } = fixture();
    writeFileSync(documentationPath, '<!-- release-readiness:status=ready -->');

    const result = runPreflight(sheetPath, documentationPath, '--verify-documentation');

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('[documentation-status]');
  });

  it('accepte une documentation rouge cohérente avec les gates manquantes', () => {
    const { sheetPath, documentationPath } = fixture();
    const result = runPreflight(sheetPath, documentationPath, '--verify-documentation');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('La documentation reflète la gate objective.');
  });
});
