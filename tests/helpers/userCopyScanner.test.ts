import { describe, expect, it } from 'vitest';
import { scanUserCopyFile, scanUserCopySource, type UserCopyFinding } from './userCopyScanner';

const FIXTURE_DIRECTORY = new URL('../fixtures/user-copy-scanner/', import.meta.url);

function fixture(name: string): URL {
  return new URL(name, FIXTURE_DIRECTORY);
}

function summarize(findings: UserCopyFinding[]) {
  return findings.map(({ kind, name, text }) => ({ kind, ...(name ? { name } : {}), text }));
}

describe('userCopyScanner', () => {
  it('finds hardcoded French and English copy only in user-facing AST contexts', () => {
    const findings = scanUserCopyFile(fixture('hardcoded-copy.tsx'));

    expect(summarize(findings)).toEqual([
      {
        kind: 'copy-variable',
        name: 'message',
        text: 'Impossible de rejoindre la partie',
      },
      { kind: 'copy-property', name: 'label', text: 'Choisir ce champion' },
      { kind: 'copy-property', name: 'title', text: 'Champion details' },
      { kind: 'copy-property', name: 'subtitle', text: 'Maîtrise actuelle' },
      { kind: 'copy-property', name: 'description', text: 'Build a stronger team' },
      { kind: 'copy-property', name: 'notice', text: 'Récompense disponible' },
      { kind: 'copy-property', name: 'hint', text: 'Press Enter to continue' },
      { kind: 'copy-property', name: 'tooltip', text: 'Afficher les statistiques' },
      { kind: 'copy-property', name: 'statusMessage', text: 'Loading your run' },
      { kind: 'copy-variable', name: 'title', text: 'Préparer la partie' },
      {
        kind: 'jsx-attribute',
        name: 'aria-label',
        text: 'Écran de préparation',
      },
      { kind: 'jsx-text', text: 'Bienvenue dans la Faille' },
      {
        kind: 'jsx-attribute',
        name: 'alt',
        text: 'Portrait du champion sélectionné',
      },
      { kind: 'jsx-attribute', name: 'placeholder', text: 'Search champions' },
      {
        kind: 'jsx-attribute',
        name: 'aria-description',
        text: 'Saisissez un nom de champion',
      },
      {
        kind: 'jsx-attribute',
        name: 'aria-valuetext',
        text: 'Progression à cinquante pour cent',
      },
      { kind: 'jsx-expression', text: 'Continuer' },
      { kind: 'jsx-expression', text: 'Try again' },
      { kind: 'jsx-expression', text: 'Bonjour' },
      { kind: 'jsx-expression', text: 'Score final:' },
      { kind: 'jsx-expression', text: 'Votre équipe est prête' },
    ]);
    expect(findings.every(({ column, line }) => column > 0 && line > 0)).toBe(true);
  });

  it('accepts i18n expressions, non-copy literals, and invariant UI tokens', () => {
    expect(scanUserCopyFile(fixture('localized-copy.tsx'))).toEqual([]);
  });

  it('supports project-specific invariant tokens without weakening copy detection', () => {
    const source = '<><span>Azir</span><span>Continue</span></>';

    expect(
      summarize(
        scanUserCopySource(source, {
          additionalInvariantTokens: ['Azir'],
          filePath: 'champion-token.fixture.tsx',
        }),
      ),
    ).toEqual([{ kind: 'jsx-text', text: 'Continue' }]);
  });
});
