import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const previewWorkflow = readFileSync(
  new URL('../.github/workflows/preview-deployment.yml', import.meta.url),
  'utf8',
);
const productionWorkflow = readFileSync(
  new URL('../.github/workflows/production-deployment.yml', import.meta.url),
  'utf8',
);
const releasePreflight = readFileSync(
  new URL('../scripts/release-preflight.mjs', import.meta.url),
  'utf8',
);
const deploymentIdentityFunction = readFileSync(
  new URL('../api/deployment-identity.mjs', import.meta.url),
  'utf8',
);
const deployedAssetsVerifier = readFileSync(
  new URL('../scripts/verify-deployed-assets.mjs', import.meta.url),
  'utf8',
);
const vercelConfig = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

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

  it("expose et vérifie l'identité du déploiement via une Function Vercel", () => {
    expect(deploymentIdentityFunction).toContain('VERCEL_GIT_COMMIT_SHA');
    expect(deploymentIdentityFunction).toContain('Response.json');
    expect(deployedAssetsVerifier).toContain('/api/deployment-identity');
    expect(deployedAssetsVerifier).toContain('deploymentIdentity?.commit');
    expect(deployedAssetsVerifier).toContain('DEPLOYMENT_IDENTITY_MAX_ATTEMPTS');
    expect(deployedAssetsVerifier).not.toContain('/deployment-identity.json');
  });

  it('réserve le fallback SPA aux routes non API', () => {
    expect(vercelConfig).toContain('"source": "/((?!api/).*)"');
    expect(vercelConfig).not.toContain('"source": "/(.*)",\n      "destination": "/index.html"');
  });

  it("vérifie la production via l'alias public et le SHA attendu", () => {
    expect(productionWorkflow).toContain('vercel.deployment.promoted');
    expect(productionWorkflow).not.toContain('vercel.deployment.success');
    expect(productionWorkflow).toContain("github.event.client_payload.environment == 'production'");
    expect(productionWorkflow).toContain('ref: ${{ github.event.client_payload.git.sha }}');
    expect(productionWorkflow).toContain(
      'EXPECTED_COMMIT_SHA: ${{ github.event.client_payload.git.sha }}',
    );
    expect(productionWorkflow).toContain('DEPLOYMENT_URL: https://lol-rogue.vercel.app');
    expect(productionWorkflow).not.toContain('DEPLOYMENT_URL: ${{ github.event.client_payload.url }}');
    expect(productionWorkflow).toContain('npm run test:deployed-assets');
  });
});
