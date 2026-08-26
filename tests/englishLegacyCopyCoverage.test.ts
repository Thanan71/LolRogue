import { readdirSync, readFileSync, statSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { translateLegacyTextToEnglish } from '@/i18n/legacyEnglish';

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

function collectUiLiterals(file: URL): string[] {
  const sourceText = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file.pathname, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const values: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const value = node.getText(source).trim();
      if (value) values.push(value);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const value = node.text.trim();
      if (value) values.push(value);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return values;
}

function relativePath(file: URL): string {
  return decodeURIComponent(file.pathname.split('/src/').at(-1) ?? file.pathname);
}

describe('couverture anglaise des textes UI historiques', () => {
  it('traduit toute chaîne française détectable dans les fichiers TSX', () => {
    expect(statSync(SRC_DIRECTORY).isDirectory()).toBe(true);
    const untranslated: string[] = [];

    for (const file of listTsxFiles(SRC_DIRECTORY)) {
      for (const value of collectUiLiterals(file)) {
        if (!FRENCH_HINT.test(value)) continue;
        const english = translateLegacyTextToEnglish(value).trim();
        if (FRENCH_HINT.test(english)) {
          untranslated.push(`${relativePath(file)} :: ${JSON.stringify(value)} -> ${JSON.stringify(english)}`);
        }
      }
    }

    expect(untranslated, untranslated.join('\n')).toEqual([]);
  });
});
