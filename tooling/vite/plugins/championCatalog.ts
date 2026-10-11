import path from 'node:path';
import type { Plugin } from 'vite';

/** Replaces only the application catalogue import with the verified client catalogue. */
export function championCatalogPlugin(root: string) {
  return {
    name: 'client-champion-catalog',
    apply: 'build',
    enforce: 'pre',
    resolveId(source: string, importer?: string) {
      if (
        source === './generated/champions-parsed.json' &&
        importer?.endsWith('/src/data/championDatabase.ts')
      ) {
        return path.resolve(root, './src/data/generated/champions-client.json');
      }
      return null;
    },
  } satisfies Plugin;
}
