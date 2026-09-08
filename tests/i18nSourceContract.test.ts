import { readdirSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanUserCopyFile, type UserCopyFinding } from './helpers/userCopyScanner';

const PROJECT_DIRECTORY = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_DIRECTORY = new URL('../src/', import.meta.url);

const INCLUDED_SOURCE_PREFIXES = [
  'src/components/',
  'src/game/presentation/',
  'src/hooks/',
  'src/pages/',
  'src/services/',
  'src/stores/',
] as const;

const INCLUDED_SOURCE_FILES = new Set(['src/App.tsx']);

const PROJECT_COPY_BEARING_NAMES = [
  'detail',
  'emptyMessage',
  'error',
  'saveError',
] as const;

// These sources deliberately contain bilingual catalog values or internal gameplay identifiers.
// User-visible projections of that data remain covered through pages/components/presentation.
const EXCLUDED_SOURCE_PREFIXES = ['src/i18n/', 'src/data/', 'src/game/'] as const;
const INCLUDED_GAMEPLAY_EXCEPTIONS = ['src/game/presentation/'] as const;

// Add only product names or gameplay tokens whose spelling is invariant in every supported locale.
// Each entry must remain recognizable without translation and should be justified in review.
const PROJECT_INVARIANT_TOKENS = [
  // Product identity and monogram.
  'LoL Rogue',
  'LR',
  // Database operations and persisted role names shown verbatim in the admin console.
  'ADMIN',
  'DELETE',
  'INSERT',
  'SELECT',
  'UPDATE',
  // International standards, controls, and compact mathematical notation.
  'CMD',
  'MAX',
  'UTC',
  'VS',
  'ms',
  'n=',
  'v',
  'x',
] as const;

function repositoryPath(file: URL): string {
  return relative(PROJECT_DIRECTORY, fileURLToPath(file)).split(sep).join('/');
}

function isTypeScriptSource(file: URL): boolean {
  return /\.tsx?$/iu.test(file.pathname) && !file.pathname.endsWith('.d.ts');
}

function isRelevantProductionSource(file: URL): boolean {
  const filePath = repositoryPath(file);
  if (!isTypeScriptSource(file)) return false;
  if (INCLUDED_SOURCE_FILES.has(filePath)) return true;

  const includedGameplayException = INCLUDED_GAMEPLAY_EXCEPTIONS.some((prefix) =>
    filePath.startsWith(prefix),
  );
  const explicitlyExcluded = EXCLUDED_SOURCE_PREFIXES.some((prefix) => filePath.startsWith(prefix));
  if (explicitlyExcluded && !includedGameplayException) return false;

  return INCLUDED_SOURCE_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function listProductionSourceFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) return listProductionSourceFiles(child);
      return isRelevantProductionSource(child) ? [child] : [];
    })
    .sort((left, right) => repositoryPath(left).localeCompare(repositoryPath(right), 'en'));
}

function formatFinding(finding: UserCopyFinding): string {
  const location = `${relative(PROJECT_DIRECTORY, finding.filePath).split(sep).join('/')}:${finding.line}:${finding.column}`;
  const context = finding.name ? `${finding.kind}:${finding.name}` : finding.kind;
  return `${location} [${context}] ${JSON.stringify(finding.text)}`;
}

function formatFindingCounts(findings: UserCopyFinding[]): string[] {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const filePath = relative(PROJECT_DIRECTORY, finding.filePath).split(sep).join('/');
    counts.set(filePath, (counts.get(filePath) ?? 0) + 1);
  }
  return [...counts].map(([filePath, count]) => `${filePath}: ${count}`);
}

describe('i18n source contract', () => {
  it('contains no raw user copy in production presentation sources', { timeout: 30_000 }, () => {
    const sourceFiles = listProductionSourceFiles(SOURCE_DIRECTORY);
    const findings = sourceFiles.flatMap((file) =>
      scanUserCopyFile(file, {
        additionalCopyBearingNames: PROJECT_COPY_BEARING_NAMES,
        additionalInvariantTokens: PROJECT_INVARIANT_TOKENS,
      }),
    );
    const diagnostics = findings.map(formatFinding);
    const findingsByFile = formatFindingCounts(findings);
    const failureMessage = [
      `Found ${findings.length} raw user-copy literal(s) across ${findingsByFile.length} of ${sourceFiles.length} scanned presentation source file(s).`,
      'Move each literal to the locale catalogs or document a true invariant in PROJECT_INVARIANT_TOKENS.',
      '',
      'Findings by file:',
      ...findingsByFile,
      '',
      'Actionable findings:',
      ...diagnostics,
    ].join('\n');

    expect(findings, failureMessage).toHaveLength(0);
  });
});
