import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translateLegacyTextToEnglish } from '@/i18n/legacyEnglish';
import { translateAuditedEnglishCopy } from '@/i18n/legacyEnglishAudit';
import { translateLegacyContentToEnglish } from '@/i18n/legacyEnglishContent';
import { translateLegacyPhraseToEnglish } from '@/i18n/legacyEnglishPhrases';

const SRC_DIRECTORY = new URL('../src/', import.meta.url);

const FRENCH_HINT = new RegExp(
  [
    '[àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ]',
    '\\b(?:le|la|les|des|du|une|dans|pour|avec|sans|votre|ton|tes|cette|ces|est|sont|peut|doit|avant|après|choisir|sélectionner|équipe|inventaire|niveau|maîtrise|dégâts|soin|soins|bouclier|armure|puissance|vitesse|objet|objets|recrutement|repos|trésor|boutique|fermer|continuer|réessayer|débloquer|prérequis|bonbons|inconnu|disponible|verrouillé|terminé|actuelle|actuel|récompense|récompenses|vague)\\b',
  ].join('|'),
  'iu',
);

function listTsxFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) return listTsxFiles(child);
    return entry.name.endsWith('.tsx') ? [child] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');
}

function isCodeArtifact(value: string): boolean {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) return true;
  if (
    /A-Za-z|className=|onClick=|aria-|<\/|\}>|=>|\bconst\b|\breturn\b|\)\}\s*>/u.test(
      normalized,
    )
  )
    return true;
  if (normalized.includes('${') && /\?|'\s*:|"\s*:/u.test(normalized)) return true;
  return false;
}

function collectUiLiterals(file: URL): string[] {
  const source = stripComments(readFileSync(file, 'utf8'));
  const values: string[] = [];

  for (const match of source.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/gu)) {
    const value = (match[2] ?? '').trim();
    if (value && !isCodeArtifact(value)) values.push(value);
  }

  for (const match of source.matchAll(/>([^<{]+)</gu)) {
    const value = (match[1] ?? '').trim();
    if (value && !isCodeArtifact(value)) values.push(value);
  }

  return values;
}

function relativePath(file: URL): string {
  const pathname = decodeURIComponent(file.pathname);
  const marker = '/src/';
  const index = pathname.lastIndexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) : pathname;
}

function translateUiCopy(value: string): string {
  const renderedLikeValue = value.replace(/\$\{fr\.common\.gold\}/gu, 'gold');
  return translateLegacyTextToEnglish(
    translateLegacyContentToEnglish(
      translateLegacyPhraseToEnglish(translateAuditedEnglishCopy(renderedLikeValue)),
    ),
  );
}

describe('couverture anglaise des textes UI historiques', () => {
  it('traduit toute chaîne française détectable dans les fichiers TSX', () => {
    expect(statSync(SRC_DIRECTORY).isDirectory()).toBe(true);
    const untranslated: string[] = [];

    for (const file of listTsxFiles(SRC_DIRECTORY)) {
      for (const value of collectUiLiterals(file)) {
        if (!FRENCH_HINT.test(value)) continue;
        const english = translateUiCopy(value).replace(/\s+/gu, ' ').trim();
        if (FRENCH_HINT.test(english)) {
          untranslated.push(
            `${relativePath(file)} :: ${JSON.stringify(value)} -> ${JSON.stringify(english)}`,
          );
        }
      }
    }

    expect(untranslated, untranslated.join('\n')).toEqual([]);
  });
});
