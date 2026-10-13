import { copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

async function developmentAssets(root: string) {
  const manifests = await Promise.all(
    ['riot-assets-manifest.json', 'riot-spell-assets-manifest.json'].map(async (name) =>
      JSON.parse(await readFile(path.resolve(root, 'src/data/generated', name), 'utf8')),
    ),
  );
  const files = new Map([
    [
      '/assets/ui/combat-arena.webp',
      { file: 'public/assets/ui/combat-arena.webp', type: 'image/webp' },
    ],
    [
      '/preload-document-locale.js',
      { file: 'preload-document-locale.js', type: 'text/javascript' },
    ],
  ]);
  for (const manifest of manifests) {
    if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) {
      throw new Error('Invalid or empty Riot development asset manifest.');
    }
    for (const entry of manifest.files) {
      const asset = entry?.path;
      if (
        typeof asset !== 'string' ||
        !/^assets\/riot\/[A-Za-z0-9._/-]+\.png$/.test(asset) ||
        asset.split('/').some((part) => !part || part === '.' || part === '..') ||
        files.has(`/${asset}`)
      ) {
        throw new Error('Unsafe or duplicate Riot development asset path.');
      }
      files.set(`/${asset}`, { file: `public/${asset}`, type: 'image/png' });
    }
  }
  return files;
}

/** Serves release assets in development and copies them with the build identity. */
export function riotAssetsPlugin(root: string, commitSha: string) {
  return {
    name: 'copy-versioned-riot-assets',
    async configureServer(server: ViteDevServer) {
      const files = await developmentAssets(root);
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split('?')[0] ?? '';
        let normalized: string;
        try {
          normalized = path.posix
            .normalize(decodeURIComponent(pathname).replace(/\\/g, '/'))
            .toLowerCase();
        } catch {
          response.statusCode = 400;
          response.end('Invalid asset path');
          return;
        }
        // Vite also serves root-relative and /@fs/ files. Keep both aliases from
        // bypassing the release allowlist or exposing the ignored staging cache.
        if (
          normalized === '/lol' ||
          normalized.startsWith('/lol/') ||
          ['/public/lol', '/public/assets'].some(
            (directory) => normalized.endsWith(directory) || normalized.includes(`${directory}/`),
          )
        ) {
          response.statusCode = 404;
          response.end('Asset not found');
          return;
        }
        const asset = files.get(pathname);
        if (!asset) {
          if (!pathname.startsWith('/assets/')) return next();
          response.statusCode = 404;
          response.end('Asset not found');
          return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.statusCode = 405;
          response.setHeader('Allow', 'GET, HEAD');
          response.end();
          return;
        }
        try {
          const bytes = await readFile(path.resolve(root, asset.file));
          response.setHeader('Content-Type', asset.type);
          response.setHeader('Cache-Control', 'no-cache');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.setHeader('Content-Length', bytes.length);
          response.end(request.method === 'HEAD' ? undefined : bytes);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            server.config.logger.error(`Unable to read development asset ${pathname}.`);
          }
          response.statusCode = 404;
          response.end('Asset not found');
        }
      });
    },
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
