import { describe, expect, it } from 'vitest';
import {
  buildImportGraph,
  checkBusinessBoundaries,
  dependencyLayer,
  extractImportEvidence,
  findImportCycles,
  summarizeImportGraph,
} from '../scripts/lib/business-boundaries.mjs';

function graphFor(source, targets = [], path = 'src/game/fixture.ts') {
  return buildImportGraph([
    { path, source },
    ...targets.map(([target, content = '']) => ({ path: target, source: content })),
  ]);
}

describe('deterministic game import boundary', () => {
  it.each([
    "import { useState } from 'react';",
    "import type { ReactNode } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "const React = await import('react');",
    "const React = require('react');",
    "import React = require('react');",
    "type ReactNode = import('react').ReactNode;",
    "import { create } from 'zustand';",
    "import { createClient } from '@supabase/supabase-js';",
  ])('rejects an injected UI/transport import: %s', (source) => {
    const violations = checkBusinessBoundaries(graphFor(source));
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('src/game/fixture.ts:1');
    expect(violations[0].message).toContain('src/game or src/domain');
    expect(violations[0].message).toContain('src/types');
  });

  it.each([
    ['@/pages/MenuPage', 'src/pages/MenuPage.tsx'],
    ['../pages/MenuPage', 'src/pages/MenuPage.tsx'],
    ['@/components/Button', 'src/components/Button.tsx'],
    ['@/hooks/useAuth', 'src/hooks/useAuth.ts'],
    ['@/audio/AudioManager', 'src/audio/AudioManager.ts'],
    ['@/stores/runStore', 'src/stores/runStore.ts'],
    ['@/services/supabaseClient', 'src/services/supabaseClient.ts'],
    ['@/services/runService', 'src/services/runService.ts'],
    ['@/services/container', 'src/services/container/index.ts'],
    [
      '@/features/combat/hooks/useCombatController',
      'src/features/combat/hooks/useCombatController.ts',
    ],
    ['@/shared/ui/Controls', 'src/shared/ui/Controls.tsx'],
    [
      '@/infrastructure/repositories/applicationRepositories',
      'src/infrastructure/repositories/applicationRepositories.ts',
    ],
    ['@/services/repositories/PlayerRepository', 'src/services/repositories/PlayerRepository.ts'],
  ])('rejects the resolved layer %s', (specifier, path) => {
    const violations = checkBusinessBoundaries(
      graphFor(`import { value } from '${specifier}';`, [[path]]),
    );
    expect(violations.some((violation) => violation.rule === 'deterministic-game-boundary')).toBe(
      true,
    );
    expect(violations[0].target).toBe(path);
  });

  it('rejects every store dependency even when it is type-only', () => {
    const graph = graphFor("import type { BattleSpeed } from '@/stores/settingsStore';", [
      ['src/stores/settingsStore.ts'],
    ]);
    expect(checkBusinessBoundaries(graph)[0].rule).toBe('deterministic-game-boundary');
  });

  it('allows explicit pure replay helpers and type-only repository contracts', () => {
    const graph = graphFor(
      `
      import { calculateCandiesForTeam } from '@/services/masteryService';
      import { enhancementService } from '@/services/enhancementService';
      import { parseChampionRunAccessSnapshot } from '@/services/championEconomyRunContract';
      import type { IEnhancementService } from '@/services/interfaces/IEnhancementRepository';
      import type { BattleSpeed } from '@/types/combatPresentation';
    `,
      [
        ['src/services/masteryService.ts'],
        ['src/services/enhancementService.ts'],
        ['src/services/championEconomyRunContract.ts'],
        ['src/services/interfaces/IEnhancementRepository.ts'],
        ['src/types/combatPresentation.ts'],
      ],
    );
    expect(checkBusinessBoundaries(graph)).toEqual([]);
  });

  it('rejects value syntax from a repository interface', () => {
    const graph = graphFor(
      "import { IEnhancementService } from '@/services/interfaces/IEnhancementRepository';",
      [['src/services/interfaces/IEnhancementRepository.ts']],
    );
    expect(checkBusinessBoundaries(graph)).toHaveLength(1);
  });

  it.each(['src/services/masteryService.ts', 'src/utils/shared.ts', 'src/types/shared.ts'])(
    'detects UI hidden behind %s and reports the import path',
    (path) => {
      const specifier = `@/${path.slice(4, -3)}`;
      const graph = graphFor(`import { value } from '${specifier}';`, [
        [path, "import React from 'react';"],
      ]);
      const violations = checkBusinessBoundaries(graph);
      expect(violations).toHaveLength(1);
      expect(violations[0].chain).toEqual(['src/game/fixture.ts', path, 'react']);
    },
  );

  it('rejects an unresolved internal import with a repair target', () => {
    const violations = checkBusinessBoundaries(
      graphFor("import { missing } from '@/types/missing';"),
    );
    expect(violations[0].message).toContain('fix the missing module');
  });

  it('rejects a relative escape into unscanned project tooling', () => {
    const violations = checkBusinessBoundaries(
      graphFor("import { effect } from '../../tooling/browser.ts';"),
    );
    expect(violations[0].message).toContain('fix the missing module');
  });

  it('rejects a computed import whose destination cannot be verified', () => {
    const violations = checkBusinessBoundaries(
      graphFor('const module = await import(moduleName);'),
    );
    expect(violations[0].message).toContain('literal import');
  });

  it('ignores comments and string literals that mention an import', () => {
    expect(
      checkBusinessBoundaries(
        graphFor(`// import React from 'react';
      const example = "import React from 'react'";
    `),
      ),
    ).toEqual([]);
  });
});

describe('bounded Edge replay locator', () => {
  const source = `
    const resolverUrl = pathToFileURL(
      resolve(process.cwd(), 'supabase/functions/verify-run/authority-version-resolver.generated.ts'),
    ).href;
    const resolver = await import(resolverUrl);
  `;
  it('allows only the fixed checked-in verifier path in the Node replay CLI', () => {
    const graph = graphFor(source, [], 'src/game/balance/balanceReproCli.ts');
    expect(checkBusinessBoundaries(graph)).toEqual([]);
    expect(graph.edges[0].replayLocator).toBe(true);
  });
  it.each([
    source.replace('authority-version-resolver.generated.ts', 'arbitrary.ts'),
    source.replace('process.cwd()', 'process.env.PATH'),
    source.replace('pathToFileURL', 'getRemoteModule'),
    `${source}\nfunction shadow() { const resolverUrl = 'react'; }`,
  ])('rejects a changed or ambiguous locator', (changed) => {
    expect(
      checkBusinessBoundaries(graphFor(changed, [], 'src/game/balance/balanceReproCli.ts')),
    ).toHaveLength(1);
  });
  it('rejects the same computed locator in another game module', () => {
    expect(checkBusinessBoundaries(graphFor(source))).toHaveLength(1);
  });
});

describe('explicit service entries and import graph evidence', () => {
  it.each([
    ['@/pages/CombatPage', 'src/pages/CombatPage.tsx'],
    ['@/components/ui/Controls', 'src/components/ui/Controls.tsx'],
    ['@/hooks/useBattleManager', 'src/hooks/useBattleManager.ts'],
  ])(
    'blocks feature imports returning through the migrated compatibility entry %s',
    (specifier, target) => {
      const graph = graphFor(
        `import { value } from '${specifier}';`,
        [[target]],
        'src/features/daily/ui/Fixture.tsx',
      );
      expect(
        checkBusinessBoundaries(graph).some(
          (violation) => violation.rule === 'feature-compatibility-direction',
        ),
      ).toBe(true);
    },
  );
  it.each([
    'src/pages/ProfilePage.tsx',
    'src/hooks/useProfile.ts',
    'src/stores/authStore.ts',
    'src/features/daily/hooks/useDailyRunController.ts',
  ])('blocks a new broad service barrel consumer from %s', (path) => {
    const graph = graphFor(
      "import { getPlayerRunStats } from '@/services';",
      [['src/services/index.ts']],
      path,
    );
    const violations = checkBusinessBoundaries(graph);
    expect(violations[0].rule).toBe('explicit-service-entry');
    expect(violations[0].message).toContain('named domain service');
  });
  it('parses JSX, inline type imports and type re-exports distinctly', () => {
    const edges = extractImportEvidence(
      'src/pages/Fixture.tsx',
      `
      import { type Foo } from '@/types/foo';
      import { type Bar, makeFoo } from '@/types/foo';
      export type { Foo as ExportedFoo } from '@/types/foo';
      export { type Bar } from '@/types/foo';
      const view = <div />;
    `,
    );
    expect(edges.map((edge) => edge.typeOnly)).toEqual([true, false, true, true]);
    expect(edges.map((edge) => edge.line)).toEqual([2, 3, 4, 5]);
  });

  it('resolves JavaScript-extension imports and directory entries to their source files', () => {
    const graph = graphFor("import { value } from './pure.js'; export * from './nested';", [
      ['src/game/pure.ts'],
      ['src/game/nested/index.ts'],
    ]);
    expect(graph.edges.map((edge) => edge.target)).toEqual([
      'src/game/pure.ts',
      'src/game/nested/index.ts',
    ]);
  });

  it('distinguishes value-syntax cycles from erased type cycles and includes proof lines', () => {
    const graph = buildImportGraph([
      { path: 'src/domain/a.ts', source: "import { b } from './b';" },
      { path: 'src/domain/b.ts', source: "import type { A } from './a';" },
    ]);
    expect(findImportCycles(graph)).toEqual([]);
    const [cycle] = findImportCycles(graph, { includeTypes: true });
    expect(cycle.members).toEqual(['src/domain/a.ts', 'src/domain/b.ts']);
    expect(cycle.evidence.map((edge) => edge.line)).toEqual([1, 1]);
    const report = summarizeImportGraph(graph);
    expect(report.layers['domain → domain']).toBe(2);
    expect(report.typeImports).toBe(1);
  });

  it('reports only strongly connected members and a real value cycle', () => {
    const graph = buildImportGraph([
      { path: 'src/domain/a.ts', source: "import './b';" },
      { path: 'src/domain/b.ts', source: "import './a'; import './c';" },
      { path: 'src/domain/c.ts', source: '' },
    ]);
    expect(findImportCycles(graph)[0].members).toEqual(['src/domain/a.ts', 'src/domain/b.ts']);
    expect(findImportCycles(graph)[0].evidence).toHaveLength(2);
    expect(
      checkBusinessBoundaries(graph).some((violation) => violation.rule === 'value-import-cycle'),
    ).toBe(true);
  });

  it('keeps the inherited store wiring cycle allowed without allowing new members', () => {
    const inherited = [
      { path: 'src/stores/authStore.ts', source: "import './enhancementStore';" },
      { path: 'src/stores/enhancementStore.ts', source: "import './authStore';" },
    ];
    expect(checkBusinessBoundaries(buildImportGraph(inherited))).toEqual([]);
    const expanded = buildImportGraph([
      inherited[0],
      { ...inherited[1], source: "import './newStore';" },
      { path: 'src/stores/newStore.ts', source: "import './authStore';" },
    ]);
    expect(checkBusinessBoundaries(expanded)[0].rule).toBe('value-import-cycle');
  });

  it('does not block erased type-only dependency cycles', () => {
    const graph = buildImportGraph([
      { path: 'src/types/a.ts', source: "import type { B } from './b';" },
      { path: 'src/types/b.ts', source: "import type { A } from './a';" },
    ]);
    expect(checkBusinessBoundaries(graph)).toEqual([]);
  });

  it('rejects an indirect value dependency from services into stores', () => {
    const graph = buildImportGraph([
      {
        path: 'src/services/runLifecycle/runStart.ts',
        source: "import { state } from '@/utils/shared';",
      },
      { path: 'src/utils/shared.ts', source: "import { useAuthStore } from '@/stores/authStore';" },
      { path: 'src/stores/authStore.ts', source: '' },
    ]);
    const [violation] = checkBusinessBoundaries(graph);
    expect(violation.rule).toBe('service-store-boundary');
    expect(violation.chain).toEqual([
      'src/services/runLifecycle/runStart.ts',
      'src/utils/shared.ts',
      'src/stores/authStore.ts',
    ]);
    expect(violation.message).toContain('stores/runLifecycleDependencies.ts');
  });

  it('classifies repository contracts, adapters, containers and transport separately', () => {
    expect(
      [
        'src/services/interfaces/IRunRepository.ts',
        'src/services/repositories/SupabaseRunRepository.ts',
        'src/services/container/RepositoryContainer.ts',
        'src/services/supabaseClient.ts',
        'src/game/run/runLedger.ts',
      ].map(dependencyLayer),
    ).toEqual(['interfaces', 'repositories', 'container', 'transport', 'game']);
  });

  it('keeps concrete repository imports in the existing container', () => {
    const target = 'src/services/repositories/SupabasePlayerRepository.ts';
    const source =
      "import { SupabasePlayerRepository } from '@/services/repositories/SupabasePlayerRepository';";
    expect(
      checkBusinessBoundaries(
        graphFor(source, [[target]], 'src/services/container/RepositoryContainer.ts'),
      ),
    ).toEqual([]);
    const [violation] = checkBusinessBoundaries(
      graphFor(source, [[target]], 'src/pages/ProfilePage.tsx'),
    );
    expect(violation.rule).toBe('repository-container-boundary');
    expect(violation.message).toContain('@/services/container/applicationRepositories');
  });

  it('rejects a feature importing a relocated concrete infrastructure adapter', () => {
    const target = 'src/infrastructure/repositories/SupabaseDailyRunRepository.ts';
    const graph = graphFor(
      "import { SupabaseDailyRunRepository } from '@/infrastructure/repositories/SupabaseDailyRunRepository';",
      [[target]],
      'src/features/daily/hooks/useDailyRunController.ts',
    );
    expect(
      checkBusinessBoundaries(graph).some(
        (violation) => violation.rule === 'repository-container-boundary',
      ),
    ).toBe(true);
    expect(dependencyLayer('src/infrastructure/repositories/applicationRepositories.ts')).toBe(
      'container',
    );
  });
});

describe('generated historical browser replay bridge', () => {
  const target = 'supabase/functions/verify-run/run-authority-0.2.5.bundle.js';
  function replayGraph(source, path = 'src/game/authority/versionClientReplay.generated.ts') {
    const graph = graphFor(source, [], path);
    graph.replayArchives = new Set([target]);
    return graph;
  }
  it('allows the exact lazy archive import from the generated bridge', () => {
    expect(
      checkBusinessBoundaries(
        replayGraph(
          "const load = () => import('../../../supabase/functions/verify-run/run-authority-0.2.5.bundle.js');",
        ),
      ),
    ).toEqual([]);
  });
  it.each([
    ["import('../../../supabase/functions/verify-run/unregistered.bundle.js')", undefined],
    [
      "import('../../../supabase/functions/verify-run/run-authority-0.2.5.bundle.js')",
      'src/game/authority/arbitrary.ts',
    ],
    ["import('../../../supabase/functions/verify-run/run-authority.bundle.js')", undefined],
    ["import('../../../supabase/functions/verify-run/index.ts')", undefined],
    ['import(target)', undefined],
  ])('rejects other imports, entry points and computed targets', (source, path) => {
    expect(checkBusinessBoundaries(replayGraph(source, path))).toHaveLength(1);
  });
});
