import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HTTPS_PATTERN = /^https:\/\//;
const MIGRATION_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/;

const options = new Set(process.argv.slice(2));
const documentationOnly = options.has('--verify-documentation');
const sheetPath = path.resolve(root, process.env.RELEASE_SHEET_PATH || 'config/beta-release.json');
const documentationPath = path.resolve(
  root,
  process.env.RELEASE_READINESS_PATH || 'docs/beta-readiness.md',
);

const run = (command, args, extra = {}) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...extra,
  }).trim();

const isValidDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isAfter = (value, boundary) =>
  isValidDate(value) && isValidDate(boundary) && Date.parse(value) > Date.parse(boundary);
const isFuture = (value) => isValidDate(value) && Date.parse(value) > Date.now();

function inspectRecordedEvidence(sheet) {
  const blockers = [];
  const block = (code, detail) => blockers.push({ code, detail });

  if (sheet.schemaVersion !== 1) block('schema', 'schemaVersion doit valoir 1');

  const p0Gates = Array.isArray(sheet.p0Gates) ? sheet.p0Gates : [];
  if (p0Gates.length === 0) block('p0', 'aucune gate P0 formalisée');
  for (const gate of p0Gates) {
    if (gate?.status !== 'verified') block('p0', `${gate?.id || 'P0 inconnu'} reste ouvert`);
    if (!Array.isArray(gate?.checks) || gate.checks.length === 0) {
      block('p0-proof', `${gate?.id || 'P0 inconnu'} ne référence aucun check exécutable`);
    }
  }

  const lastP0Fix = sheet.lastP0Fix || {};
  if (!SHA_PATTERN.test(lastP0Fix.sha || '')) {
    block('last-p0-sha', 'le SHA exact du dernier correctif P0 manque');
  }
  if (!isValidDate(lastP0Fix.mergedAt)) {
    block('last-p0-date', 'la date de merge du dernier correctif P0 manque');
  }

  const candidate = sheet.candidate || {};
  if (!SHA_PATTERN.test(candidate.sha || ''))
    block('candidate-sha', 'le SHA candidat exact manque');
  if (!HTTPS_PATTERN.test(candidate.previewUrl || '')) {
    block('preview-url', "l'URL HTTPS de preview du candidat manque");
  }
  if (!MIGRATION_PATTERN.test(`${candidate.liveMigrationVersion || ''}.sql`)) {
    block('live-migration', 'la version de migration live manque');
  }

  const requiredJobs = Array.isArray(sheet.requiredCiJobs) ? sheet.requiredCiJobs : [];
  for (const job of ['validate', 'e2e', 'database', 'clean-room']) {
    if (!requiredJobs.includes(job)) block('ci-contract', `le job CI requis ${job} manque`);
  }

  const ciRuns = Array.isArray(sheet.ciRuns) ? sheet.ciRuns : [];
  if (ciRuns.length !== 3) block('ci-count', 'exactement trois CI candidates sont requises');
  if (new Set(ciRuns.map(({ runId }) => runId)).size !== ciRuns.length) {
    block('ci-duplicate', 'les trois CI doivent être des runs distincts');
  }
  for (const [index, ciRun] of ciRuns.entries()) {
    if (!Number.isInteger(ciRun?.runId)) block('ci-run-id', `CI ${index + 1}: runId manque`);
    if (!HTTPS_PATTERN.test(ciRun?.url || '')) block('ci-run-url', `CI ${index + 1}: URL manque`);
  }

  const advisors = sheet.supabaseAdvisors || {};
  if (advisors.status !== 'passed') block('advisors', 'les advisors Supabase ne sont pas validés');
  if (!HTTPS_PATTERN.test(advisors.evidenceUrl || '')) {
    block('advisors-proof', 'la preuve des advisors Supabase manque');
  }
  if (!isAfter(advisors.checkedAt, lastP0Fix.mergedAt)) {
    block('advisors-date', 'les advisors doivent être contrôlés après le dernier correctif P0');
  }
  if (isFuture(advisors.checkedAt)) block('advisors-date', 'la date des advisors est future');

  const external = Array.isArray(sheet.externalValidations) ? sheet.externalValidations : [];
  for (const required of [
    'accessibility-human',
    'legal-privacy-fr-eu',
    'support-channel',
    'riot-ip-authorization',
  ]) {
    const validation = external.find((entry) => entry?.id === required);
    if (validation?.status !== 'passed') {
      block('external-validation', `${required} reste à valider`);
      continue;
    }
    if (!HTTPS_PATTERN.test(validation.evidenceUrl || '')) {
      block('external-proof', `${required}: URL de preuve manquante`);
    }
    if (!isAfter(validation.checkedAt, lastP0Fix.mergedAt)) {
      block('external-date', `${required}: preuve antérieure au dernier correctif P0`);
    }
    if (isFuture(validation.checkedAt)) {
      block('external-date', `${required}: date de preuve future`);
    }
  }

  return blockers;
}

function latestLocalMigration() {
  return fs
    .readdirSync(path.join(root, 'supabase/migrations'))
    .filter((file) => MIGRATION_PATTERN.test(file))
    .sort()
    .at(-1)
    ?.replace(/\.sql$/, '');
}

function inspectLiveEvidence(sheet) {
  const blockers = [];
  const block = (code, detail) => blockers.push({ code, detail });
  const { candidate, lastP0Fix, requiredCiJobs, ciRuns } = sheet;

  try {
    const localSha = run('git', ['rev-parse', 'HEAD']);
    if (localSha !== candidate.sha) {
      block('candidate-sha-live', `HEAD ${localSha} diffère du candidat ${candidate.sha}`);
    }
  } catch (error) {
    block('candidate-sha-live', `lecture de HEAD impossible: ${error.message}`);
  }

  try {
    run('git', ['merge-base', '--is-ancestor', lastP0Fix.sha, candidate.sha]);
  } catch {
    block('last-p0-ancestry', "le dernier correctif P0 n'est pas un ancêtre du candidat");
  }

  if (latestLocalMigration() !== candidate.liveMigrationVersion) {
    block(
      'migration-repository',
      `la dernière migration du dépôt est ${latestLocalMigration()}, pas ${candidate.liveMigrationVersion}`,
    );
  }

  for (const ciRun of ciRuns) {
    try {
      const payload = JSON.parse(
        run('gh', [
          'run',
          'view',
          String(ciRun.runId),
          '--json',
          'conclusion,createdAt,headSha,jobs,status,url',
        ]),
      );
      if (payload.status !== 'completed' || payload.conclusion !== 'success') {
        block('ci-result', `CI ${ciRun.runId} n'est pas terminée avec succès`);
      }
      if (payload.headSha !== candidate.sha) {
        block('ci-sha', `CI ${ciRun.runId} ne teste pas le SHA candidat`);
      }
      if (payload.url !== ciRun.url)
        block('ci-url', `CI ${ciRun.runId}: URL enregistrée incorrecte`);
      if (!isAfter(payload.createdAt, lastP0Fix.mergedAt)) {
        block('ci-date', `CI ${ciRun.runId} est antérieure au dernier correctif P0`);
      }
      for (const requiredJob of requiredCiJobs) {
        const job = payload.jobs.find(({ name }) => name === requiredJob);
        if (!job || job.conclusion !== 'success') {
          block('ci-job', `CI ${ciRun.runId}: job ${requiredJob} absent ou non réussi`);
        }
      }
    } catch (error) {
      block('ci-live', `CI ${ciRun.runId} invérifiable via GitHub: ${error.message}`);
    }
  }

  try {
    run('node', ['scripts/check-database-migration-drift.mjs', '--linked']);
  } catch (error) {
    block('migration-live', `drift des migrations live: ${error.message}`);
  }

  try {
    run('node', ['scripts/verify-deployed-assets.mjs'], {
      env: { ...process.env, DEPLOYMENT_URL: candidate.previewUrl },
    });
  } catch (error) {
    block('preview-assets', `preview candidate invalide: ${error.message}`);
  }

  return blockers;
}

function inspectDocumentation(documentation, expectedStatus) {
  const blockers = [];
  const marker = `<!-- release-readiness:status=${expectedStatus} -->`;
  if (!documentation.includes(marker)) {
    blockers.push({
      code: 'documentation-status',
      detail: `docs/beta-readiness.md doit contenir ${marker}`,
    });
  }
  if (
    expectedStatus === 'blocked' &&
    (documentation.includes('Les dix critères techniques sont donc **démontrés**') ||
      documentation.includes('| Aucun P0 ouvert | Démontré'))
  ) {
    blockers.push({
      code: 'documentation-claim',
      detail: 'la documentation conserve une affirmation verte devenue fausse',
    });
  }
  return blockers;
}

function printReport(status, blockers) {
  const icon = status === 'ready' ? 'READY' : 'BLOCKED';
  console.log(`Beta release preflight: ${icon}`);
  for (const { code, detail } of blockers) console.log(`- [${code}] ${detail}`);
}

let sheet;
let documentation;
try {
  sheet = JSON.parse(fs.readFileSync(sheetPath, 'utf8'));
  documentation = fs.readFileSync(documentationPath, 'utf8');
} catch (error) {
  console.error(`Beta release preflight: configuration illisible: ${error.message}`);
  process.exit(1);
}

const recordedBlockers = inspectRecordedEvidence(sheet);
const liveBlockers =
  documentationOnly || recordedBlockers.length > 0 ? [] : inspectLiveEvidence(sheet);
const objectiveBlockers = [...recordedBlockers, ...liveBlockers];
const objectiveStatus = objectiveBlockers.length === 0 ? 'ready' : 'blocked';
const consistencyBlockers = [];

if (sheet.declaredStatus !== objectiveStatus) {
  consistencyBlockers.push({
    code: 'sheet-status',
    detail: `declaredStatus=${sheet.declaredStatus}, état objectif=${objectiveStatus}`,
  });
}
consistencyBlockers.push(...inspectDocumentation(documentation, objectiveStatus));

if (documentationOnly) {
  printReport(objectiveStatus, objectiveBlockers);
  if (consistencyBlockers.length > 0) {
    printReport('blocked', consistencyBlockers);
    process.exit(1);
  }
  console.log('La documentation reflète la gate objective.');
  process.exit(0);
}

const blockers = [...objectiveBlockers, ...consistencyBlockers];
printReport(blockers.length === 0 ? 'ready' : 'blocked', blockers);
process.exit(blockers.length === 0 ? 0 : 1);
