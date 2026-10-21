import { describe, expect, it } from 'vitest';
import {
  buildImportGraph,
  checkBusinessBoundaries,
  readBusinessImportGraph,
} from '../scripts/lib/business-boundaries.mjs';

const root = 'src/features/administration/';

function violations(source, specifier, target) {
  const graph = buildImportGraph([
    { path: source, source: `import { value } from '${specifier}';` },
    ...(target ? [{ path: target, source: 'export const value = 1;' }] : []),
  ]);
  return checkBusinessBoundaries(graph);
}

describe('administration module boundaries', () => {
  it.each([
    ['domain/contracts.ts', '../hooks/useData', 'hooks/useData.ts', 'domain'],
    ['domain/contracts.ts', '../infrastructure/queries', 'infrastructure/queries.ts', 'domain'],
    ['domain/contracts.ts', 'react', null, 'domain'],
    ['infrastructure/queries.ts', '../ui/Panel', 'ui/Panel.tsx', 'infrastructure'],
    ['infrastructure/queries.ts', '../hooks/useData', 'hooks/useData.ts', 'infrastructure'],
    ['hooks/useData.ts', '../ui/Panel', 'ui/Panel.tsx', 'hooks'],
    ['ui/Panel.tsx', '../infrastructure/queries', 'infrastructure/queries.ts', 'ui'],
  ])('rejects %s importing %s', (source, specifier, target, layer) => {
    expect(violations(root + source, specifier, target && root + target)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: `administration-${layer}-boundary` }),
      ]),
    );
  });

  it.each(['ui/Panel.tsx', 'hooks/useData.ts', 'domain/contracts.ts'])(
    'rejects direct Supabase transport in %s',
    (source) => {
      expect(
        violations(root + source, '@/services/supabaseClient', 'src/services/supabaseClient.ts'),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: `administration-${source.split('/')[0]}-boundary`,
          }),
        ]),
      );
    },
  );

  it.each([
    ['import', "import { value } from '@/features/administration/ui/Panel';"],
    ['export', "export { value } from '@/features/administration/ui/Panel';"],
    ['dynamic import', "const panel = import('@/features/administration/ui/Panel');"],
    ['type import', "type Panel = import('@/features/administration/ui/Panel').Panel;"],
  ])('requires the public entry for an external %s', (_, source) => {
    const graph = buildImportGraph([
      { path: 'src/pages/OtherPage.tsx', source },
      { path: root + 'ui/Panel.tsx', source: '' },
    ]);
    expect(checkBusinessBoundaries(graph)).toEqual([
      expect.objectContaining({ rule: 'administration-public-entry' }),
    ]);
  });

  it('allows the wrapper and inward dependencies without introducing another container', () => {
    const graph = buildImportGraph([
      {
        path: 'src/pages/AdminPage.tsx',
        source: "import { value } from '@/features/administration';",
      },
      {
        path: root + 'index.ts',
        source: "export { value } from './ui/Panel';",
      },
      {
        path: root + 'ui/Panel.tsx',
        source: "import { value } from '../hooks/useData';",
      },
      {
        path: root + 'hooks/useData.ts',
        source: "import { value } from '../infrastructure/queries';",
      },
      {
        path: root + 'infrastructure/queries.ts',
        source:
          "import { value } from '@/services/supabaseClient'; import type { Contract } from '../domain/contracts';",
      },
      {
        path: 'src/services/supabaseClient.ts',
        source: 'export const value = 1;',
      },
      {
        path: root + 'domain/contracts.ts',
        source: 'export interface Contract { id: string }',
      },
    ]);
    expect(checkBusinessBoundaries(graph)).toEqual([]);
  });

  it('keeps gameplay independent of administration even through its public entry', () => {
    const graph = buildImportGraph([
      {
        path: 'src/game/fixture.ts',
        source: "import { value } from '@/features/administration';",
      },
      { path: root + 'index.ts', source: 'export const value = 1;' },
    ]);
    expect(checkBusinessBoundaries(graph)).toEqual([
      expect.objectContaining({ rule: 'deterministic-game-boundary' }),
    ]);
  });

  it('validates the resolved repository graph, including lazy imports', () => {
    const graph = readBusinessImportGraph(process.cwd());
    expect(
      graph.edges.filter(
        (edge) =>
          edge.source === root + 'ui/AdministrationScreen.tsx' && edge.kind === 'dynamic-import',
      ),
    ).toHaveLength(3);
    expect(checkBusinessBoundaries(graph)).toEqual([]);
  });
});
