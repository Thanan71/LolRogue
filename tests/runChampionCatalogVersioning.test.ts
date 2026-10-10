import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { getAuthorityChampionCatalogVersion } from '@/game/authority/versionRegistry';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { synchronizeMapFrontier } from '@/game/map/mapProgression';
import type { NodeMap } from '@/game/map/types';
import { getRunChampionCatalog } from '@/game/run/runChampionCatalog';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

const frozenSource = readFileSync(
  new URL('../supabase/functions/verify-run/run-authority-v21.bundle.ts', import.meta.url),
  'utf8',
)
  .replace(/^\/\/ @ts-nocheck\r?\n/, '')
  .replace(/export\{([^{}]*)\};?\s*$/, 'export{$1,generateRunMap};');
const frozen = (await import(
  /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(frozenSource).toString('base64')}`
)) as { generateRunMap(seed: number): NodeMap[] };

describe('versioned run champion catalogues', () => {
  afterEach(() => useRunStore.setState(structuredClone(RUN_INITIAL_STATE)));

  it('selects the published catalogue independently of progression feature flags', () => {
    expect(getAuthorityChampionCatalogVersion('run-engine-v21')).toBe(1);
    expect(getAuthorityChampionCatalogVersion('run-engine-v22')).toBe(2);
    expect(getAuthorityChampionCatalogVersion('unknown-engine')).toBeUndefined();
    expect(getRunChampionCatalog('run-engine-v21')).toHaveLength(10);
    expect(getRunChampionCatalog('run-engine-v22').map((champion) => champion.id)).toContain(
      'Veigar',
    );
    expect(() => getRunChampionCatalog('run-engine-v999')).toThrow(
      'unsupported_run_champion_catalog',
    );
  });

  it.each([0, 2, 42, 424242, 2116951237])(
    'preserves every v21 map and all shop/recruit/event draws (seed %s)',
    (seed) => {
      expect(generateRunMap(seed, getRunChampionCatalog('run-engine-v21'))).toEqual(
        frozen.generateRunMap(seed),
      );
    },
  );

  it('regenerates an in-flight v21 client map using its server engine and seed', () => {
    useRunStore.setState({
      ...structuredClone(RUN_INITIAL_STATE),
      authorityAttempt: { engineVersion: 'run-engine-v21', seed: 42 } as RunAuthorityAttempt,
    });
    useRunStore.getState().generateRunMap(999);
    const expected = frozen.generateRunMap(42);
    synchronizeMapFrontier(expected, 0, [expected[0]!.startNodeId]);
    expect(useRunStore.getState().biomeMaps).toEqual(expected);
    expect(JSON.stringify(useRunStore.getState().biomeMaps)).not.toContain('Veigar');
  });
});
