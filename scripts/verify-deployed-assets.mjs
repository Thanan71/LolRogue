import fs from 'node:fs/promises';

const deploymentUrl = process.env.DEPLOYMENT_URL?.trim();
if (!deploymentUrl) {
  throw new Error(
    'DEPLOYMENT_URL is required: remote deployment checks never default to production.',
  );
}
const baseUrl = deploymentUrl.replace(/\/$/, '');
const expectedCommitSha = process.env.EXPECTED_COMMIT_SHA?.trim();
if (!expectedCommitSha || !/^[0-9a-f]{40}$/.test(expectedCommitSha)) {
  throw new Error('EXPECTED_COMMIT_SHA must be an explicit full lowercase Git SHA.');
}

const identityMaxAttempts = Number.parseInt(
  process.env.DEPLOYMENT_IDENTITY_MAX_ATTEMPTS ?? '8',
  10,
);
const identityRetryDelayMs = Number.parseInt(
  process.env.DEPLOYMENT_IDENTITY_RETRY_DELAY_MS ?? '5000',
  10,
);
if (!Number.isInteger(identityMaxAttempts) || identityMaxAttempts < 1) {
  throw new Error('DEPLOYMENT_IDENTITY_MAX_ATTEMPTS must be a positive integer.');
}
if (!Number.isInteger(identityRetryDelayMs) || identityRetryDelayMs < 0) {
  throw new Error('DEPLOYMENT_IDENTITY_RETRY_DELAY_MS must be a non-negative integer.');
}

const manifest = JSON.parse(
  await fs.readFile(
    new URL('../src/data/generated/riot-assets-manifest.json', import.meta.url),
    'utf8',
  ),
);

if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
  throw new Error('The Riot asset manifest is empty.');
}

const sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

async function fetchDeploymentIdentity() {
  let lastError;

  for (let attempt = 1; attempt <= identityMaxAttempts; attempt += 1) {
    try {
      const identityResponse = await fetch(`${baseUrl}/api/deployment-identity`, {
        redirect: 'follow',
        cache: 'no-store',
      });
      const identityBody = await identityResponse.text();
      if (!identityResponse.ok) {
        throw new Error(
          `Deployment identity endpoint returned ${identityResponse.status}: ${identityBody}`,
        );
      }

      let deploymentIdentity;
      try {
        deploymentIdentity = JSON.parse(identityBody);
      } catch (error) {
        throw new Error('Deployment identity endpoint returned invalid JSON.', { cause: error });
      }

      const deployedCommitSha = deploymentIdentity?.commit;
      if (deployedCommitSha !== expectedCommitSha) {
        throw new Error(
          `Deployment identity mismatch: expected ${expectedCommitSha}, received ${deployedCommitSha || 'missing'}.`,
        );
      }

      return deploymentIdentity;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === identityMaxAttempts) break;

      console.warn(
        `Deployment identity attempt ${attempt}/${identityMaxAttempts} failed: ${lastError.message} Retrying in ${identityRetryDelayMs}ms.`,
      );
      await sleep(identityRetryDelayMs);
    }
  }

  throw lastError ?? new Error('Deployment identity verification failed.');
}

await fetchDeploymentIdentity();

const failures = [];
for (let offset = 0; offset < manifest.files.length; offset += 12) {
  const batch = manifest.files.slice(offset, offset + 12);
  await Promise.all(
    batch.map(async ({ path, bytes }) => {
      const response = await fetch(`${baseUrl}/${path}`, { redirect: 'follow' });
      const body = await response.arrayBuffer();
      if (!response.ok || body.byteLength !== bytes) {
        failures.push({
          path,
          status: response.status,
          expectedBytes: bytes,
          actualBytes: body.byteLength,
        });
      }
    }),
  );
}

if (failures.length > 0) {
  throw new Error(`Deployed Riot assets are invalid: ${JSON.stringify(failures.slice(0, 10))}`);
}

console.log(
  `Verified ${manifest.files.length} deployed Riot assets at ${baseUrl} for commit ${expectedCommitSha}.`,
);
