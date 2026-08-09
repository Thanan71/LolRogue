import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const script = resolve(root, 'scripts/verify-deployed-assets.mjs');
const expectedCommitSha = '0123456789abcdef0123456789abcdef01234567';

const runVerifier = (deploymentUrl: string, deployedCommitSha: string) =>
  new Promise<{ status: number | null; stderr: string }>((resolveResult) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      env: {
        ...process.env,
        DEPLOYMENT_URL: deploymentUrl,
        EXPECTED_COMMIT_SHA: deployedCommitSha,
      },
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => resolveResult({ status, stderr }));
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

  it('refuse une preview dont le marqueur ne correspond pas au SHA attendu', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        '<html><head><meta name="lolrogue-commit" content="ffffffffffffffffffffffffffffffffffffffff"></head></html>',
      );
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
});
