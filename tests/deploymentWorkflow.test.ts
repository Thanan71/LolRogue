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
const deploymentIdentityWriter = readFileSync(
  new URL('../scripts/write-deployment-identity.mjs', import.meta.url),
  'utf8',
);
const deployedAssetsVerifier = readFileSync(
  new URL('../scripts/verify-deployed-assets.mjs', import.meta.url),
  'utf8',
);
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');

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

  it("génère et vérifie un artefact JSON d'identité du déploiement", () => {
    expect(packageJson).toContain('node scripts/write-deployment-identity.mjs');
    expect(deploymentIdentityWriter).toContain('VERCEL_GIT_COMMIT_SHA');
    expect(deploymentIdentityWriter).toContain('deployment-identity.json');
    expect(deployedAssetsVerifier).toContain('/deployment-identity.json');
    expect(deployedAssetsVerifier).toContain('deploymentIdentity?.commit');
  });

  it('conserve un seul contrôle post-déploiement réservé à la production promue', () => {
    expect(productionWorkflow).toContain('vercel.deployment.promoted');
    expect(productionWorkflow).not.toContain('vercel.deployment.success');
    expect(productionWorkflow).toContain("github.event.client_payload.environment == 'production'");
    expect(productionWorkflow).toContain('ref: ${{ github.event.client_payload.git.sha }}');
    expect(productionWorkflow).toContain(
      'EXPECTED_COMMIT_SHA: ${{ github.event.client_payload.git.sha }}',
    );
    expect(productionWorkflow).toContain('DEPLOYMENT_URL: ${{ github.event.client_payload.url }}');
    expect(productionWorkflow).toContain('npm run test:deployed-assets');
    expect(productionWorkflow).not.toContain('lol-rogue.vercel.app');
  });
});
