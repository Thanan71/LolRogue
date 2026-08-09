import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const vercel = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
const index = await readFile(join(dist, 'index.html'));
const expectedCommitSha =
  process.env.APP_COMMIT_SHA?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.trim() || 'local';
const securityHeaders = Object.fromEntries(
  vercel.headers.flatMap((entry) => entry.headers.map(({ key, value }) => [key, value])),
);
const immutableAssetHeader = vercel.headers
  .find((entry) => entry.source === '/assets/(.*)')
  ?.headers.find(({ key }) => key.toLowerCase() === 'cache-control')?.value;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function safeAssetPath(pathname) {
  const relative = normalize(pathname).replace(/^[/\\]+/, '');
  const target = resolve(dist, relative);
  return target.startsWith(`${dist}/`) ? target : null;
}

const server = createServer(async (request, response) => {
  for (const [key, value] of Object.entries(securityHeaders)) response.setHeader(key, value);
  const pathname = new URL(request.url ?? '/', 'http://clean-room.test').pathname;
  if (pathname.startsWith('/assets/')) {
    const target = safeAssetPath(pathname);
    try {
      if (!target || !(await stat(target)).isFile()) throw new Error('missing');
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(target)] ?? 'application/octet-stream',
      });
      response.end(await readFile(target));
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(index);
});

await new Promise((resolveStarted) => server.listen(0, '127.0.0.1', resolveStarted));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to start build verifier.');
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  if (!index.toString('utf8').includes(`name="lolrogue-commit" content="${expectedCommitSha}"`)) {
    throw new Error(`The production build does not identify commit ${expectedCommitSha}.`);
  }

  for (const route of ['/auth', '/run', '/daily-run', '/profile', '/unknown/deep-link']) {
    const response = await fetch(`${baseUrl}${route}`);
    if (response.status !== 200 || !(await response.text()).includes('<div id="root"></div>')) {
      throw new Error(`SPA deep link failed for ${route}.`);
    }
    if (!response.headers.get('content-security-policy')?.includes("default-src 'self'")) {
      throw new Error(`CSP is missing for ${route}.`);
    }
    if (response.headers.get('x-content-type-options') !== 'nosniff') {
      throw new Error(`Security headers are missing for ${route}.`);
    }
    if (!response.headers.get('strict-transport-security')?.includes('max-age=31536000')) {
      throw new Error(`HSTS is missing for ${route}.`);
    }
  }

  const assets = [...index.toString('utf8').matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(
    (match) => match[1],
  );
  if (assets.length === 0) throw new Error('No built assets were referenced by index.html.');
  for (const asset of assets) {
    const response = await fetch(`${baseUrl}${asset}`);
    if (response.status !== 200)
      throw new Error(`Built asset returned ${response.status}: ${asset}`);
    if (immutableAssetHeader !== 'public, max-age=31536000, immutable') {
      throw new Error('Versioned assets must use an immutable one-year cache policy.');
    }
  }

  const missing = await fetch(`${baseUrl}/assets/__missing-clean-room__.js`);
  if (missing.status !== 404 || (await missing.text()).includes('<div id="root"></div>')) {
    throw new Error('Missing assets must return a real 404 instead of the SPA shell.');
  }
  console.log(
    `Production build verified: ${assets.length} entry assets, deep links, CSP and asset 404.`,
  );
} finally {
  await new Promise((resolveClosed, reject) =>
    server.close((error) => (error ? reject(error) : resolveClosed())),
  );
}
