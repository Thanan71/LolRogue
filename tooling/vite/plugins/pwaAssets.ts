import { readFileSync } from 'node:fs';
import { copyFile, cp } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

/** Serves and copies installation assets without enabling an offline service worker. */
export function pwaAssetsPlugin(root: string) {
  return {
    name: 'pwa-installation-assets',
    configureServer(server: ViteDevServer) {
      const files = new Map([
        ['/manifest.webmanifest', 'application/manifest+json'],
        ['/pwa/icon-192.png', 'image/png'],
        ['/pwa/icon-512.png', 'image/png'],
        ['/pwa/maskable-512.png', 'image/png'],
        ['/pwa/apple-touch-icon.png', 'image/png'],
      ]);
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0] ?? '';
        const type = files.get(pathname);
        if (!type) return next();
        response.setHeader('Content-Type', type);
        response.setHeader('Cache-Control', 'no-cache');
        response.end(readFileSync(path.resolve(root, 'public', pathname.slice(1))));
      });
    },
    async writeBundle() {
      await copyFile(
        path.resolve(root, 'public/manifest.webmanifest'),
        path.resolve(root, 'dist/manifest.webmanifest'),
      );
      await cp(path.resolve(root, 'public/pwa'), path.resolve(root, 'dist/pwa'), {
        recursive: true,
      });
    },
  } satisfies Plugin;
}
