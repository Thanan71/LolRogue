import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const script = resolve(root, 'scripts/verify-deployed-assets.mjs');

describe('deployed asset verifier', () => {
  it('refuse un contrôle CI sans URL de déploiement explicite', () => {
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        DEPLOYMENT_URL: '',
        EXPECTED_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DEPLOYMENT_URL is required');
    expect(result.stderr).not.toContain('lol-rogue.vercel.app');
  });
});
