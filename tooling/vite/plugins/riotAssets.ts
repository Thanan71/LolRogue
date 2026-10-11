import { copyFile, cp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Copies the integrity-checked release assets and the resolved deployment identity. */
export function riotAssetsPlugin(root: string, commitSha: string) {
  return {
    name: 'copy-versioned-riot-assets',
    apply: 'build',
    async writeBundle() {
      await copyFile(
        path.resolve(root, 'preload-document-locale.js'),
        path.resolve(root, 'dist/preload-document-locale.js'),
      );
      await cp(path.resolve(root, 'public/assets'), path.resolve(root, 'dist/assets'), {
        recursive: true,
      });
      await writeFile(
        path.resolve(root, 'dist/deployment-identity.json'),
        `${JSON.stringify({ commit: commitSha })}\n`,
        'utf8',
      );
    },
  } satisfies Plugin;
}
