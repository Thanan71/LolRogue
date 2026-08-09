import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ciWorkflow = readFileSync(
  new URL('../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);

describe('deployment workflow contract', () => {
  it('ne vérifie aucun déploiement distant dans la validation générique', () => {
    expect(ciWorkflow).not.toContain('test:deployed-assets');
    expect(ciWorkflow).not.toContain('lol-rogue.vercel.app');
  });
});
