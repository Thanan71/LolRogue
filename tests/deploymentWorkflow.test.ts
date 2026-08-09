import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const previewWorkflow = readFileSync(
  new URL('../.github/workflows/preview-deployment.yml', import.meta.url),
  'utf8',
);
const releasePreflight = readFileSync(
  new URL('../scripts/release-preflight.mjs', import.meta.url),
  'utf8',
);
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

describe('deployment workflow contract', () => {
  it('ne vérifie aucun déploiement distant dans la validation générique', () => {
    expect(ciWorkflow).not.toContain('test:deployed-assets');
    expect(ciWorkflow).not.toContain('lol-rogue.vercel.app');
  });

  it('reconstruit et vérifie la preview du SHA réellement déployé pour une PR ouverte', () => {
    expect(previewWorkflow).toContain('repository_dispatch:');
    expect(previewWorkflow).toContain('vercel.deployment.success');
    expect(previewWorkflow).toContain("github.event.client_payload.environment == 'preview'");
    expect(previewWorkflow).toContain('commits/$DEPLOYED_SHA/pulls');
    expect(previewWorkflow).toContain('ref: ${{ github.event.client_payload.git.sha }}');
    expect(previewWorkflow).toContain('APP_COMMIT_SHA: ${{ github.event.client_payload.git.sha }}');
    expect(previewWorkflow).toContain('DEPLOYMENT_URL: ${{ github.event.client_payload.url }}');
    expect(previewWorkflow).toContain('npm run build');
    expect(previewWorkflow).toContain('npm run test:deployed-assets');
    expect(previewWorkflow).not.toContain('lol-rogue.vercel.app');
  });

  it("fournit explicitement l'URL et le SHA du candidat au contrôle de release", () => {
    expect(releasePreflight).toContain('DEPLOYMENT_URL: candidate.previewUrl');
    expect(releasePreflight).toContain('EXPECTED_COMMIT_SHA: candidate.sha');
  });

  it('injecte le SHA Vercel dans le marqueur public du build', () => {
    expect(viteConfig).toContain('process.env.VERCEL_GIT_COMMIT_SHA');
    expect(viteConfig).toContain("name: 'lolrogue-commit'");
    expect(viteConfig).toContain('content: deploymentCommitSha');
  });
});
