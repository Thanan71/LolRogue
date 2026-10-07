import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const provenanceFile = 'provenance.json';

function validateIdentity(identity) {
  if (
    !/^[0-9a-f]{40}$/.test(identity.commit || '') ||
    !/^[\w.-]+\/[\w.-]+$/.test(identity.repository || '') ||
    !/^\d+$/.test(identity.runId || '') ||
    !/^\d+$/.test(identity.runAttempt || '') ||
    identity.profile !== 'production'
  ) {
    throw new Error(
      'Build provenance requires a full SHA, repository, run, attempt and production profile.',
    );
  }
}

/** Inventory every regular file, refusing links and special files before serving the build. */
export async function inventoryBuild(dist) {
  const entries = [];
  if (!(await lstat(dist)).isDirectory())
    throw new Error('Build directory must be a real directory.');
  async function visit(directory, relative = '') {
    for (const name of (await readdir(directory)).sort()) {
      if (name.includes('\\')) throw new Error('Build paths must use portable file names.');
      const file = join(directory, name);
      const relativePath = relative ? `${relative}/${name}` : name;
      const stat = await lstat(file);
      if (stat.isDirectory()) await visit(file, relativePath);
      else if (stat.isFile()) {
        entries.push({
          path: relativePath,
          size: stat.size,
          sha256: createHash('sha256')
            .update(await readFile(file))
            .digest('hex'),
        });
      } else throw new Error(`Build contains a link or special file: ${relativePath}`);
    }
  }
  await visit(dist);
  if (entries.length === 0) throw new Error('Cannot reuse an empty build.');
  return entries;
}

/** Sign a disposable build inventory; the private key never leaves producer memory. */
export async function packageBuildArtifact(sourceDist, artifactRoot, identity) {
  validateIdentity(identity);
  await inventoryBuild(sourceDist);
  const deploymentIdentity = JSON.parse(
    await readFile(join(sourceDist, 'deployment-identity.json'), 'utf8'),
  );
  if (deploymentIdentity.commit !== identity.commit)
    throw new Error('Build deployment SHA differs from producer SHA.');
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  await cp(sourceDist, join(artifactRoot, 'dist'), { recursive: true });
  const manifest = {
    version: 1,
    ...identity,
    files: await inventoryBuild(join(artifactRoot, 'dist')),
  };
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const signature = sign(null, Buffer.from(JSON.stringify(manifest)), privateKey).toString(
    'base64',
  );
  await writeFile(
    join(artifactRoot, provenanceFile),
    `${JSON.stringify({ manifest, signature })}\n`,
  );
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

/** The expected public key comes from the producer job output, never the downloaded bundle. */
export async function verifyBuildArtifact(artifactRoot, expectedIdentity, trustedPublicKey) {
  validateIdentity(expectedIdentity);
  if (!trustedPublicKey)
    throw new Error('A trusted producer public key is required to reuse a build.');
  const { manifest, signature } = JSON.parse(
    await readFile(join(artifactRoot, provenanceFile), 'utf8'),
  );
  if (
    !manifest ||
    manifest.version !== 1 ||
    !verify(
      null,
      Buffer.from(JSON.stringify(manifest)),
      { key: Buffer.from(trustedPublicKey, 'base64'), type: 'spki', format: 'der' },
      Buffer.from(signature || '', 'base64'),
    )
  ) {
    throw new Error('Build provenance signature is invalid.');
  }
  for (const field of ['commit', 'repository', 'runId', 'runAttempt', 'profile']) {
    if (manifest[field] !== expectedIdentity[field])
      throw new Error(`Build provenance mismatch: ${field}.`);
  }
  const actual = await inventoryBuild(join(artifactRoot, 'dist'));
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) {
    throw new Error('Build inventory does not match the signed files.');
  }
  const deploymentIdentity = JSON.parse(
    await readFile(join(artifactRoot, 'dist/deployment-identity.json'), 'utf8'),
  );
  if (deploymentIdentity.commit !== expectedIdentity.commit)
    throw new Error('Reused build has a different deployment SHA.');
  return manifest;
}
