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
const manifest = JSON.parse(
  await fs.readFile(new URL('../src/data/generated/riot-assets-manifest.json', import.meta.url)),
);

if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
  throw new Error('The Riot asset manifest is empty.');
}

const indexResponse = await fetch(`${baseUrl}/`, { redirect: 'follow', cache: 'no-store' });
const indexHtml = await indexResponse.text();
if (!indexResponse.ok) {
  throw new Error(`Deployment identity endpoint returned ${indexResponse.status}.`);
}
const deployedCommitSha = indexHtml.match(
  /<meta\s+[^>]*name=["']lolrogue-commit["'][^>]*content=["']([^"']+)["'][^>]*>/i,
)?.[1];
if (deployedCommitSha !== expectedCommitSha) {
  throw new Error(
    `Deployment identity mismatch: expected ${expectedCommitSha}, received ${deployedCommitSha || 'missing'}.`,
  );
}

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
