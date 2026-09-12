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

const INCLUDED_SOURCE_FILES = new Set(['src/App.tsx', 'src/game/run/abandonment.ts']);

const PROJECT_COPY_BEARING_NAMES = ['detail', 'emptyMessage', 'error', 'saveError'] as const;

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

// These exact internal values are part of the byte-pinned run-engine-v21 bundle. They are never
// presentation copy: the enhancement store discards them and resolves localized UI messages from
// stable validation conditions. Keep this exception exact so any additional service literal fails.
const AUTHORITY_BOUND_INTERNAL_FINDINGS = [
  "src/services/enhancementService.ts|copy-property|error|Cette amélioration n'est pas disponible dans le moteur de combat actuel",
  'src/services/enhancementService.ts|copy-property|error|Niveau de maîtrise requis:',
  'src/services/enhancementService.ts|copy-property|error|Candies insuffisants:',
  'src/services/enhancementService.ts|copy-property|error|requis',
  'src/services/enhancementService.ts|copy-property|error|Ce nœud est déjà au maximum',
  'src/services/enhancementService.ts|copy-property|error|Prérequis non débloqués',
  'src/services/masteryService.ts|copy-property|description|Ajoute un champion au choix de départ, sans agrandir l’équipe.',
  'src/services/masteryService.ts|copy-property|description|Accorde une relance du choix de départ, sans avantage en combat.',
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

function findingIdentity(finding: UserCopyFinding): string {
  const filePath = relative(PROJECT_DIRECTORY, finding.filePath).split(sep).join('/');
  return [filePath, finding.kind, finding.name ?? '', finding.text].join('|');
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
    const allFindings = sourceFiles.flatMap((file) =>
      scanUserCopyFile(file, {
        additionalCopyBearingNames: PROJECT_COPY_BEARING_NAMES,
        additionalInvariantTokens: PROJECT_INVARIANT_TOKENS,
      }),
    );
    const authorityBoundIdentities = new Set<string>(AUTHORITY_BOUND_INTERNAL_FINDINGS);
    const authorityBoundFindings = allFindings.filter((finding) =>
      authorityBoundIdentities.has(findingIdentity(finding)),
    );
    const findings = allFindings.filter(
      (finding) => !authorityBoundIdentities.has(findingIdentity(finding)),
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

    expect(
      authorityBoundFindings.map(findingIdentity).sort(),
      'The exact authority-bound exception changed. Keep replayable v21 byte-stable and update the presentation boundary instead.',
    ).toEqual([...AUTHORITY_BOUND_INTERNAL_FINDINGS].sort());
    expect(findings, failureMessage).toHaveLength(0);
  });
});
