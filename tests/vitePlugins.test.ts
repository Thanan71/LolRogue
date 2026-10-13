import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingHttpHeaders, request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { championCatalogPlugin } from '../tooling/vite/plugins/championCatalog';
import { deploymentIdentityPlugin } from '../tooling/vite/plugins/deploymentIdentity';
import { pwaAssetsPlugin } from '../tooling/vite/plugins/pwaAssets';
import { riotAssetsPlugin } from '../tooling/vite/plugins/riotAssets';

const fixtureRoots: string[] = [];
const commitSha = 'e296e50036e7708cb4c241202a3e6c77505f3334';
const portraitPath = 'assets/riot/version/champions/Champion.png';
const spellPath = 'assets/riot/version/spells/ChampionQ.png';
const manifestPath = 'src/data/generated/riot-assets-manifest.json';
const spellManifestPath = 'src/data/generated/riot-spell-assets-manifest.json';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
  'base64',
);

interface HttpResponse {
  status?: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}
type SendRequest = (url: string, method?: string) => Promise<HttpResponse>;

async function withHttpServer(
  root: string,
  plugins: Plugin[],
  run: (send: SendRequest) => Promise<void>,
) {
  let vite: ViteDevServer | undefined;
  try {
    vite = await createServer({
      root,
      configFile: false,
      publicDir: false,
      plugins: [
        {
          name: 'capture-fixture-server-for-cleanup',
          configureServer(server) {
            vite = server;
          },
        },
        ...plugins,
      ],
      server: { middlewareMode: true },
    });
    const middleware = vite.middlewares;
    const server = createHttpServer((req, res) =>
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end('next middleware');
      }),
    );
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing fixture HTTP address');
      const send: SendRequest = (url, method = 'GET') =>
        new Promise((resolve, reject) => {
          request({ hostname: '127.0.0.1', port: address.port, path: url, method }, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('error', reject);
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
      await run(send);
    } finally {
      if (server.listening) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }
  } finally {
    await vite?.close();
  }
}

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'lolrogue-vite-plugins-')));
  fixtureRoots.push(root);
  await mkdir(path.join(root, 'public/pwa'), { recursive: true });
  for (const directory of [
    'public/assets/riot/version/champions',
    'public/assets/riot/version/spells',
    'public/assets/ui',
    'src/data/generated',
  ]) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  await mkdir(path.join(root, 'public/lol'), { recursive: true });
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'public/manifest.webmanifest'), '{"name":"LolRogue"}\n');
  for (const name of ['icon-192', 'icon-512', 'maskable-512', 'apple-touch-icon']) {
    await writeFile(path.join(root, `public/pwa/${name}.png`), Buffer.from([0, 1, 2, 255]));
  }
  await writeFile(path.join(root, 'public', portraitPath), png);
  await writeFile(path.join(root, 'public', spellPath), png);
  await writeFile(path.join(root, 'public/assets/ui/combat-arena.webp'), 'RIFFfixtureWEBP');
  await writeFile(
    path.join(root, manifestPath),
    JSON.stringify({ schemaVersion: 1, files: [{ path: portraitPath }] }),
  );
  await writeFile(
    path.join(root, spellManifestPath),
    JSON.stringify({ schemaVersion: 1, files: [{ path: spellPath }] }),
  );
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
      'assets/riot/version/spells/ChampionQ.png',
      'assets/ui/combat-arena.webp',
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
    await withHttpServer(root, [pwaAssetsPlugin(root)], async (send) => {
      for (const [url, type] of [
        ['/manifest.webmanifest?install=1', 'application/manifest+json'],
        ['/pwa/icon-192.png?size=192', 'image/png'],
      ]) {
        const response = await send(url);
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe(type);
        expect(response.headers['cache-control']).toBe('no-cache');
        expect(response.body).toEqual(
          await readFile(path.join(root, 'public', url.split('?')[0].slice(1))),
        );
      }
      for (const url of ['/pwa/unknown.png', '/pwa/../lol/raw-cache.json']) {
        const response = await send(url);
        expect(response.status).toBe(404);
        expect(response.body.toString()).not.toBe('excluded');
      }
    });
  });

  it('serves manifested Riot PNGs, the arena and locale script in development with GET/HEAD parity', async () => {
    const root = await fixture();
    const plugin = riotAssetsPlugin(root, commitSha);
    await plugin.writeBundle();
    await withHttpServer(root, [plugin], async (send) => {
      for (const [relative, type] of [
        [portraitPath, 'image/png'],
        [spellPath, 'image/png'],
        ['assets/ui/combat-arena.webp', 'image/webp'],
        ['preload-document-locale.js', 'text/javascript'],
      ]) {
        const built = await readFile(path.join(root, 'dist', relative));
        const response = await send(`/${relative}?cache=changed`);
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe(type);
        expect(response.headers['cache-control']).toBe('no-cache');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['content-length']).toBe(String(built.length));
        expect(response.body).toEqual(built);
        if (type === 'image/png') {
          expect(response.body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        }
        const head = await send(`/${relative}`, 'HEAD');
        expect(head.status).toBe(200);
        expect(head.headers['content-type']).toBe(type);
        expect(head.headers['cache-control']).toBe('no-cache');
        expect(head.headers['x-content-type-options']).toBe('nosniff');
        expect(head.headers['content-length']).toBe(String(built.length));
        expect(head.body).toHaveLength(0);
      }
      await writeFile(path.join(root, 'public', portraitPath), Buffer.concat([png, png]));
      expect((await send(`/${portraitPath}`)).body).toEqual(Buffer.concat([png, png]));
    });
  });

  it('returns 404 for missing declared assets and refuses unsupported request methods', async () => {
    const root = await fixture();
    await withHttpServer(root, [riotAssetsPlugin(root, commitSha)], async (send) => {
      await rm(path.join(root, 'public', portraitPath));
      expect((await send(`/${portraitPath}`)).status).toBe(404);
      const missingHead = await send(`/${portraitPath}`, 'HEAD');
      expect(missingHead.status).toBe(404);
      expect(missingHead.body).toHaveLength(0);
      const post = await send(`/${spellPath}`, 'POST');
      expect(post.status).toBe(405);
      expect(post.headers.allow).toBe('GET, HEAD');
      expect(post.body).toHaveLength(0);
    });
  });

  it('does not expose unknown assets, traversal paths or the raw cache', async () => {
    const root = await fixture();
    await writeFile(path.join(root, 'public/assets/riot/version/champions/Unknown.png'), png);
    await withHttpServer(root, [riotAssetsPlugin(root, commitSha)], async (send) => {
      for (const url of [
        '/assets/riot/version/champions/Unknown.png',
        '/assets/riot/version/champions/%2e%2e/%2e%2e/%2e%2e/%2e%2e/lol/raw-cache.json',
        '/assets/../lol/raw-cache.json',
        '/assets/riot/version/champions/Champion.png/../../../../../lol/raw-cache.json',
        '/lol/raw-cache.json',
        '/public/lol/raw-cache.json',
        '/PUBLIC/LoL/raw-cache.json',
        '/public/%6col/raw-cache.json',
        '/public/lol%2fraw-cache.json',
        '/public%5clol%5craw-cache.json',
        '/assets/..%2fpublic%2flol%2fraw-cache.json',
        '/public/assets/riot/version/champions/Unknown.png',
        '/public/%61ssets/riot/version/champions/Unknown.png',
        `/@fs${path.join(root, 'public/lol/raw-cache.json')}`,
        `/@fs${root}/public/%6col/raw-cache.json`,
      ]) {
        const response = await send(url);
        expect.soft(response.status, url).toBe(404);
        expect.soft(response.body.toString(), url).not.toBe('excluded');
        expect.soft(response.body, url).not.toEqual(png);
      }
    });
  });

  it('rejects malformed URL encoding without serving an asset or crashing', async () => {
    const root = await fixture();
    await withHttpServer(root, [riotAssetsPlugin(root, commitSha)], async (send) => {
      for (const url of ['/assets/%', '/public/lol/%E0%A4%A']) {
        const response = await send(url);
        expect(response.status).toBe(400);
        expect(response.body.toString()).not.toBe('excluded');
      }
      expect((await send(`/${portraitPath}`)).body).toEqual(png);
    });
  });

  it.each([
    ['missing files', { schemaVersion: 1 }],
    ['empty files', { schemaVersion: 1, files: [] }],
    ['invalid schema', { schemaVersion: 2, files: [{ path: portraitPath }] }],
    ['null entry', { schemaVersion: 1, files: [null] }],
    ['traversal', { schemaVersion: 1, files: [{ path: 'assets/riot/version/../secret.png' }] }],
    [
      'duplicate file',
      { schemaVersion: 1, files: [{ path: portraitPath }, { path: portraitPath }] },
    ],
    ['duplicate between manifests', { schemaVersion: 1, files: [{ path: spellPath }] }],
  ])('rejects a %s development manifest before starting', async (_name, manifest) => {
    const root = await fixture();
    await writeFile(path.join(root, manifestPath), JSON.stringify(manifest));
    await expect(
      withHttpServer(root, [riotAssetsPlugin(root, commitSha)], async () => undefined),
    ).rejects.toThrow(/manifest|path/i);
  });

  it.each(['missing', 'malformed'])('rejects a %s development manifest file', async (condition) => {
    const root = await fixture();
    if (condition === 'missing') await rm(path.join(root, spellManifestPath));
    else await writeFile(path.join(root, spellManifestPath), '{');
    await expect(
      withHttpServer(root, [riotAssetsPlugin(root, commitSha)], async () => undefined),
    ).rejects.toThrow();
  });
});
