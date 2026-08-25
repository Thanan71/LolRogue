import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const script = resolve(root, 'scripts/verify-deployed-assets.mjs');
const expectedCommitSha = '0123456789abcdef0123456789abcdef01234567';
const automationBypassSecret = 'vercel-automation-bypass-test-secret';
const manifest = JSON.parse(
  readFileSync(resolve(root, 'src/data/generated/riot-assets-manifest.json'), 'utf8'),
) as { files: { path: string; bytes: number }[] };
const assetSizes = new Map(manifest.files.map(({ path, bytes }) => [`/${path}`, bytes]));

const runVerifier = (deploymentUrl: string, deployedCommitSha: string) =>
  new Promise<{ status: number | null; stderr: string; stdout: string }>((resolveResult) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      env: {
        ...process.env,
        DEPLOYMENT_URL: deploymentUrl,
        EXPECTED_COMMIT_SHA: deployedCommitSha,
        VERCEL_AUTOMATION_BYPASS_REQUIRED: 'true',
        VERCEL_AUTOMATION_BYPASS_SECRET: automationBypassSecret,
        DEPLOYMENT_IDENTITY_MAX_ATTEMPTS: '3',
        DEPLOYMENT_IDENTITY_RETRY_DELAY_MS: '5',
      },
    });
    let stderr = '';
    let stdout = '';
    child.stderr.setEncoding('utf8');
    child.stdout.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('close', (status) => resolveResult({ status, stderr, stdout }));
  });

describe('deployed asset verifier', () => {
  it('refuse un contrôle CI sans URL de déploiement explicite', () => {
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        DEPLOYMENT_URL: '',
        EXPECTED_COMMIT_SHA: expectedCommitSha,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DEPLOYMENT_URL is required');
    expect(result.stderr).not.toContain('lol-rogue.vercel.app');
  });

  it("refuse explicitement une CI protégée sans secret d'automatisation Vercel", () => {
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        DEPLOYMENT_URL: 'https://preview.example.test',
        EXPECTED_COMMIT_SHA: expectedCommitSha,
        VERCEL_AUTOMATION_BYPASS_REQUIRED: 'true',
        VERCEL_AUTOMATION_BYPASS_SECRET: '',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'VERCEL_AUTOMATION_BYPASS_SECRET is required for protected deployment checks in CI.',
    );
  });

  it("refuse une preview dont l'identité JSON ne correspond pas au SHA attendu", async () => {
    const server = createServer((request, response) => {
      if (request.url === '/api/deployment-identity') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ commit: 'ffffffffffffffffffffffffffffffffffffffff' }));
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolveStarted) => server.listen(0, '127.0.0.1', resolveStarted));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not start.');

    try {
      const result = await runVerifier(`http://127.0.0.1:${address.port}`, expectedCommitSha);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `Deployment identity mismatch: expected ${expectedCommitSha}, received ffffffffffffffffffffffffffffffffffffffff.`,
      );
    } finally {
      await new Promise<void>((resolveClosed, reject) =>
        server.close((error) => (error ? reject(error) : resolveClosed())),
      );
    }
  });

  it("refuse un endpoint d'identité qui ne renvoie pas du JSON", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<html></html>');
    });
    await new Promise<void>((resolveStarted) => server.listen(0, '127.0.0.1', resolveStarted));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not start.');

    try {
      const result = await runVerifier(`http://127.0.0.1:${address.port}`, expectedCommitSha);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Deployment identity endpoint returned invalid JSON.');
    } finally {
      await new Promise<void>((resolveClosed, reject) =>
        server.close((error) => (error ? reject(error) : resolveClosed())),
      );
    }
  });

  it('réessaie pendant la propagation Vercel puis accepte la bonne identité', async () => {
    let identityRequests = 0;
    const server = createServer((request, response) => {
      if (request.url === '/api/deployment-identity') {
        identityRequests += 1;
        if (identityRequests < 3) {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end('<!DOCTYPE html><html></html>');
          return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ commit: expectedCommitSha }));
        return;
      }
      const bytes = assetSizes.get(request.url || '');
      if (bytes === undefined) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      response.end(Buffer.alloc(bytes));
    });
    await new Promise<void>((resolveStarted) => server.listen(0, '127.0.0.1', resolveStarted));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not start.');

    try {
      const deploymentUrl = `http://127.0.0.1:${address.port}`;
      const result = await runVerifier(deploymentUrl, expectedCommitSha);

      expect(result.status).toBe(0);
      expect(identityRequests).toBe(3);
      expect(result.stderr).toContain('Deployment identity attempt 1/3 failed');
      expect(result.stderr).toContain('Deployment identity attempt 2/3 failed');
      expect(result.stdout).toContain(
        `Verified ${manifest.files.length} deployed Riot assets at ${deploymentUrl} for commit ${expectedCommitSha}.`,
      );
    } finally {
      await new Promise<void>((resolveClosed, reject) =>
        server.close((error) => (error ? reject(error) : resolveClosed())),
      );
    }
  });

  it("envoie le bypass sur l'identité et chaque asset sans jamais l'afficher", async () => {
    const receivedBypassHeaders: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      const bypassHeader = request.headers['x-vercel-protection-bypass'];
      receivedBypassHeaders.push(
        Array.isArray(bypassHeader) ? bypassHeader.join(', ') : bypassHeader,
      );
      if (request.url === '/api/deployment-identity') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ commit: expectedCommitSha }));
        return;
      }
      const bytes = assetSizes.get(request.url || '');
      if (bytes === undefined) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      response.end(Buffer.alloc(bytes));
    });
    await new Promise<void>((resolveStarted) => server.listen(0, '127.0.0.1', resolveStarted));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not start.');

    try {
      const deploymentUrl = `http://127.0.0.1:${address.port}`;
      const result = await runVerifier(deploymentUrl, expectedCommitSha);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(receivedBypassHeaders).toHaveLength(manifest.files.length + 1);
      expect(receivedBypassHeaders).toEqual(
        Array.from({ length: manifest.files.length + 1 }, () => automationBypassSecret),
      );
      expect(`${result.stdout}${result.stderr}`).not.toContain(automationBypassSecret);
      expect(result.stdout).toContain(
        `Verified ${manifest.files.length} deployed Riot assets at ${deploymentUrl} for commit ${expectedCommitSha}.`,
      );
    } finally {
      await new Promise<void>((resolveClosed, reject) =>
        server.close((error) => (error ? reject(error) : resolveClosed())),
      );
    }
  });
});
