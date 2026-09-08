import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE_DIRECTORY = new URL('../src/', import.meta.url);

const RETIRED_TRANSLATOR_FILES = [
  'i18n/legacyEnglish.ts',
  'i18n/legacyEnglishAudit.ts',
  'i18n/legacyEnglishContent.ts',
  'i18n/legacyEnglishPhrases.ts',
] as const;

const RETIRED_TRANSLATOR_MARKERS = [
  'legacyEnglish',
  'localizeUserCopy',
  'translateLegacy',
  'translateAuditedEnglishCopy',
  'installAuditedEnglishCopyTranslation',
] as const;

function listSourceFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) return listSourceFiles(child);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [child] : [];
  });
}

function relativePath(file: URL): string {
  const pathname = decodeURIComponent(file.pathname);
  const marker = '/src/';
  const index = pathname.lastIndexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) : pathname;
}

describe('contrat sans traduction anglaise legacy', () => {
  it('garde les traducteurs DOM retirés du dépôt', () => {
    for (const file of RETIRED_TRANSLATOR_FILES) {
      expect(existsSync(new URL(file, SOURCE_DIRECTORY)), file).toBe(false);
    }
  });

  it('interdit de réintroduire leurs imports ou leurs API dans le code source', () => {
    const references = listSourceFiles(SOURCE_DIRECTORY).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return RETIRED_TRANSLATOR_MARKERS.filter((marker) => source.includes(marker)).map(
        (marker) => `${relativePath(file)} :: ${marker}`,
      );
    });

    expect(references, references.join('\n')).toEqual([]);
  });
});
