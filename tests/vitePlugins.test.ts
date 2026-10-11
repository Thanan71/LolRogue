import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { championCatalogPlugin } from '../tooling/vite/plugins/championCatalog';
import { deploymentIdentityPlugin } from '../tooling/vite/plugins/deploymentIdentity';
import { pwaAssetsPlugin } from '../tooling/vite/plugins/pwaAssets';
import { riotAssetsPlugin } from '../tooling/vite/plugins/riotAssets';

const fixtureRoots: string[] = [];
const commitSha = 'e296e50036e7708cb4c241202a3e6c77505f3334';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'lolrogue-vite-plugins-'));
  fixtureRoots.push(root);
  await mkdir(path.join(root, 'public/pwa'), { recursive: true });
  await mkdir(path.join(root, 'public/assets/riot/version/champions'), {
    recursive: true,
  });
  await mkdir(path.join(root, 'public/lol'), { recursive: true });
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'public/manifest.webmanifest'), '{"name":"LolRogue"}\n');
  for (const name of ['icon-192', 'icon-512', 'maskable-512', 'apple-touch-icon']) {
    await writeFile(path.join(root, `public/pwa/${name}.png`), Buffer.from([0, 1, 2, 255]));
  }
  await writeFile(path.join(root, 'public/assets/riot/version/champions/Champion.png'), 'portrait');
  await writeFile(path.join(root, 'public/lol/raw-cache.json'), 'excluded');
  await writeFile(path.join(root, 'preload-document-locale.js'), 'window.documentLocale = "fr";');
  return root;
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('extracted Vite plugins', () => {
  it('replaces only the champion database catalogue import during builds', () => {
    const root = path.resolve('/workspace with spaces');
    const plugin = championCatalogPlugin(root);
    expect(plugin.apply).toBe('build');
    expect(plugin.enforce).toBe('pre');
    expect(
      plugin.resolveId('./generated/champions-parsed.json', `${root}/src/data/championDatabase.ts`),
    ).toBe(path.join(root, 'src/data/generated/champions-client.json'));
    expect(
      plugin.resolveId('./generated/champions-parsed.json', `${root}/src/game/authority.ts`),
    ).toBeNull();
    expect(
      plugin.resolveId('./generated/champions-client.json', `${root}/src/data/championDatabase.ts`),
    ).toBeNull();
    expect(plugin.resolveId('./generated/champions-parsed.json')).toBeNull();
  });

  it('keeps the document intact and injects the resolved commit into the head', () => {
    const html = '<html><head></head><body>game</body></html>';
    expect(deploymentIdentityPlugin(commitSha).transformIndexHtml(html)).toEqual({
      html,
      tags: [
        {
          tag: 'meta',
          attrs: { name: 'lolrogue-commit', content: commitSha },
          injectTo: 'head',
        },
      ],
    });
    expect(deploymentIdentityPlugin('local').transformIndexHtml(html).tags[0].attrs.content).toBe(
      'local',
    );
  });

  it('emits installation, locale and Riot assets without copying the raw cache', async () => {
    const root = await fixture();
    await Promise.all([
      pwaAssetsPlugin(root).writeBundle(),
      riotAssetsPlugin(root, commitSha).writeBundle(),
    ]);
    for (const relative of [
      'manifest.webmanifest',
      'pwa/icon-192.png',
      'pwa/icon-512.png',
      'pwa/maskable-512.png',
      'pwa/apple-touch-icon.png',
      'assets/riot/version/champions/Champion.png',
    ]) {
      expect(await readFile(path.join(root, 'dist', relative))).toEqual(
        await readFile(path.join(root, 'public', relative)),
      );
    }
    expect(await readFile(path.join(root, 'dist/preload-document-locale.js'))).toEqual(
      await readFile(path.join(root, 'preload-document-locale.js')),
    );
    expect(await readFile(path.join(root, 'dist/deployment-identity.json'), 'utf8')).toBe(
      `${JSON.stringify({ commit: commitSha })}\n`,
    );
    await expect(readFile(path.join(root, 'dist/lol/raw-cache.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(path.join(root, 'dist/sw.js'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails the build when an installation or locale input is missing', async () => {
    const root = await fixture();
    await rm(path.join(root, 'public/manifest.webmanifest'));
    await expect(pwaAssetsPlugin(root).writeBundle()).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await rm(path.join(root, 'preload-document-locale.js'));
    await expect(riotAssetsPlugin(root, commitSha).writeBundle()).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(path.join(root, 'dist/deployment-identity.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('serves only allowlisted PWA paths with their MIME type and no-cache header', async () => {
    const root = await fixture();
    const vite = await createServer({
      root,
      configFile: false,
      publicDir: false,
      plugins: [
        pwaAssetsPlugin(root),
        {
          name: 'fixture-next-middleware',
          configureServer(server) {
            server.middlewares.use((_req, res) => {
              res.statusCode = 404;
              res.end('next middleware');
            });
          },
        },
      ],
      server: { middlewareMode: true },
    });
    const server = createHttpServer((req, res) =>
      vite.middlewares(req, res, () => {
        res.statusCode = 404;
        res.end('next middleware');
      }),
    );
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing fixture HTTP address');
      const get = (url: string) =>
        new Promise<{
          status?: number;
          headers: import('node:http').IncomingHttpHeaders;
          body: Buffer;
        }>((resolve, reject) => {
          request({ hostname: '127.0.0.1', port: address.port, path: url }, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () =>
              resolve({
                status: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks),
              }),
            );
          })
            .on('error', reject)
            .end();
        });
      for (const [url, type] of [
        ['/manifest.webmanifest?install=1', 'application/manifest+json'],
        ['/pwa/icon-192.png?size=192', 'image/png'],
      ]) {
        const response = await get(url);
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe(type);
        expect(response.headers['cache-control']).toBe('no-cache');
        expect(response.body).toEqual(
          await readFile(path.join(root, 'public', url.split('?')[0].slice(1))),
        );
      }
      for (const url of ['/pwa/unknown.png', '/pwa/../lol/raw-cache.json']) {
        const response = await get(url);
        expect(response.status).toBe(404);
        expect(response.body.toString()).toBe('next middleware');
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await vite.close();
    }
  });
});
