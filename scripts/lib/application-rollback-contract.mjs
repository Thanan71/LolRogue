import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Matching migration ordinals alone cannot attest an immutable SQL prefix. */
export function assertRollbackMigrationContents(candidateSha, root) {
  if (!/^[0-9a-f]{40}$/.test(candidateSha)) throw new Error('A full rollback Git SHA is required.');
  const entries = execFileSync(
    'git',
    ['ls-tree', '-r', candidateSha, '--', 'supabase/migrations'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
    .trim()
    .split('\n');
  let count = 0;
  for (const entry of entries) {
    const match = entry.match(/^\d+ blob ([0-9a-f]{40})\t(supabase\/migrations\/\d{14}_.+\.sql)$/);
    if (!match) continue;
    const [, , path] = match;
    const bytes = readFileSync(resolve(root, path));
    const original = execFileSync('git', ['show', `${candidateSha}:${path}`], { cwd: root });
    if (!bytes.equals(original)) throw new Error(`Rollback migration content diverges: ${path}.`);
    count++;
  }
  if (count === 0) throw new Error('Rollback checkpoint has no versioned SQL migrations.');
  return { migrationCount: count };
}

/** The approved application must actually understand the authority still active in SQL. */
export function assertRollbackAuthorityCompatibility(candidateRegistry, currentRegistry) {
  const current = currentRegistry.versions.filter((entry) => entry.status === 'current');
  if (current.length !== 1) throw new Error('Rollback requires exactly one current authority.');
  const active = current[0];
  const candidate = candidateRegistry.versions.find((entry) => entry.engine === active.engine);
  const fields = [
    'engine',
    'gameplay',
    'progression',
    'command',
    'dailyScore',
    'championCatalog',
    'rulesetCode',
    'contentHash',
  ];
  if (
    !candidate ||
    !['current', 'replay-only'].includes(candidate.status) ||
    fields.some((field) => candidate[field] !== active[field]) ||
    Object.keys(active.features).some(
      (feature) => candidate.features?.[feature] !== active.features[feature],
    )
  ) {
    throw new Error('Rollback application does not support the exact active authority contract.');
  }
  return {
    engine: active.engine,
    contentHash: active.contentHash,
    progression: active.progression,
    championCatalog: active.championCatalog,
  };
}

export function readRollbackAuthorityCompatibility(candidateSha, root) {
  const candidate = JSON.parse(
    execFileSync('git', ['show', `${candidateSha}:config/authority-versions.json`], {
      cwd: root,
      encoding: 'utf8',
    }),
  );
  const current = JSON.parse(readFileSync(resolve(root, 'config/authority-versions.json'), 'utf8'));
  return assertRollbackAuthorityCompatibility(candidate, current);
}
