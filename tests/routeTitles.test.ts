import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/config/routes';
import { ROUTE_TITLE_PATHS, routeTitle } from '@/i18n/routeTitles';

function readRouteTitlePaths(): Record<string, string[]> {
  const ast = parse(readFileSync(new URL('../src/i18n/routeTitles.ts', import.meta.url), 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript'],
  });
  const declaration = ast.program.body
    .filter((node) => node.type === 'VariableDeclaration')
    .flatMap((node) => node.declarations)
    .find((node) => node.id.type === 'Identifier' && node.id.name === 'ROUTE_TITLES');
  let value = declaration?.init;
  while (value?.type === 'TSAsExpression' || value?.type === 'TSSatisfiesExpression') {
    value = value.expression;
  }
  if (value?.type !== 'ObjectExpression') throw new Error('Missing route title catalog');

  return Object.fromEntries(
    value.properties.map((locale) => {
      if (
        locale.type !== 'ObjectProperty' ||
        locale.key.type !== 'StringLiteral' ||
        locale.value.type !== 'ObjectExpression'
      ) {
        throw new Error('Route title locales must be explicit objects');
      }
      const paths = locale.value.properties.map((entry) => {
        if (entry.type !== 'ObjectProperty' || entry.key.type !== 'StringLiteral') {
          throw new Error('Every route title must have an explicit path');
        }
        return entry.key.value;
      });
      return [locale.key.value, paths.sort()];
    }),
  );
}

function readDeclaredRoutePaths(): string[] {
  const ast = parse(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  const paths: string[] = [];

  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'JSXOpeningElement') {
      const name = node.name as { type: string; name: string };
      if (name.type === 'JSXIdentifier' && name.name === 'Route') {
        const attributes = node.attributes as {
          type: string;
          name?: { name: string };
          value?: { type: string; value: string };
        }[];
        const path = attributes.find(
          (attribute) => attribute.type === 'JSXAttribute' && attribute.name?.name === 'path',
        );
        if (path?.value?.type !== 'StringLiteral') {
          throw new Error('Route path discovery must support every declared route');
        }
        if (path.value.value !== '*') paths.push(path.value.value);
      }
    }
    Object.values(node).forEach(visit);
  }
  visit(ast);
  return paths.sort();
}

describe('route titles', () => {
  it('has exactly the same route keys in French, English, and the declared application routes', () => {
    const localePaths = readRouteTitlePaths();
    const declaredPaths = readDeclaredRoutePaths();

    expect(Object.keys(localePaths).sort()).toEqual(['en-US', 'fr-FR']);
    expect(localePaths['fr-FR']).toEqual(declaredPaths);
    expect(localePaths['en-US']).toEqual(declaredPaths);
    expect([...ROUTE_TITLE_PATHS].sort()).toEqual(declaredPaths);
    expect(Object.values(ROUTES).sort()).toEqual(declaredPaths);
  });

  it('covers every routed page in both locales without a cross-locale fallback', () => {
    expect(ROUTE_TITLE_PATHS.length).toBeGreaterThan(0);

    for (const pathname of ROUTE_TITLE_PATHS) {
      expect(routeTitle('fr-FR', pathname)).not.toBe('Page introuvable');
      expect(routeTitle('en-US', pathname)).not.toBe('Page not found');
    }
  });

  it('uses a locale-specific title for unknown routes', () => {
    expect(routeTitle('fr-FR', '/unknown')).toBe('Page introuvable');
    expect(routeTitle('en-US', '/unknown')).toBe('Page not found');
  });
});
