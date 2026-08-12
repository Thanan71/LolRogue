import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { evaluateAdvisorFindings } from './lib/supabase-advisor-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const argumentsSet = new Set(process.argv.slice(2));
const linked = argumentsSet.has('--linked');
const local = argumentsSet.has('--local');
if (linked === local) throw new Error('Pass exactly one of --local or --linked.');
const scope = linked ? '--linked' : '--local';
const policy = JSON.parse(await readFile(resolve(root, 'config/supabase-advisors.json'), 'utf8'));

function runAdvisors(type) {
  const result = spawnSync(
    'supabase',
    [
      'db',
      'advisors',
      scope,
      '--type',
      type,
      '--level',
      'info',
      '--fail-on',
      'none',
      '--agent',
      'yes',
      '--output-format',
      'json',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Supabase ${type} advisors exited with status ${result.status}.`);
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`Supabase ${type} advisors returned invalid JSON.`, { cause: error });
  }
}

const reports = {
  security: runAdvisors('security'),
  performance: runAdvisors('performance'),
};
const result = evaluateAdvisorFindings(policy, reports);
const counts = result.findings.reduce(
  (summary, finding) => {
    summary[finding.type][finding.level] = (summary[finding.type][finding.level] ?? 0) + 1;
    return summary;
  },
  { security: {}, performance: {} },
);

console.table(
  Object.fromEntries(
    Object.entries(counts).map(([type, levels]) => [
      type,
      { INFO: levels.INFO ?? 0, WARN: levels.WARN ?? 0, ERROR: levels.ERROR ?? 0 },
    ]),
  ),
);
if (result.blockers.length > 0) {
  throw new Error(
    `Supabase advisor policy failed:\n${result.blockers
      .map((blocker) => `- [${blocker.code}] ${blocker.detail}`)
      .join('\n')}`,
  );
}
console.log(`Supabase ${scope.slice(2)} advisors satisfy the versioned policy.`);
