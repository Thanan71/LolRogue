import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageBuildArtifact, verifyBuildArtifact } from '../scripts/lib/ci-build-artifact.mjs';

const temporaryDirectories = [];
const identity = {
  commit: 'a'.repeat(40),
  repository: 'example/game',
  runId: '123',
  runAttempt: '1',
  profile: 'production',
};

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'lolrogue-build-artifact-'));
  temporaryDirectories.push(directory);
  const source = join(directory, 'source');
  const artifact = join(directory, 'artifact');
  await mkdir(source);
  await writeFile(join(source, 'index.html'), '<html>production</html>');
  await writeFile(
    join(source, 'deployment-identity.json'),
    JSON.stringify({ commit: identity.commit }),
  );
  const publicKey = await packageBuildArtifact(source, artifact, identity);
  return { source, artifact, publicKey };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('same-run signed CI build reuse', () => {
  it('accepts the complete build signed by the expected producer for the exact SHA and run', async () => {
    const { artifact, publicKey } = await fixture();
    const manifest = await verifyBuildArtifact(artifact, identity, publicKey);
    expect(manifest.files).toHaveLength(2);
    expect(manifest.commit).toBe(identity.commit);
  });

  it.each(['commit', 'repository', 'runId', 'runAttempt', 'profile'])(
    'refuses another %s despite a valid signature',
    async (field) => {
      const { artifact, publicKey } = await fixture();
      const otherIdentity = {
        ...identity,
        [field]: {
          commit: 'b'.repeat(40),
          repository: 'other/game',
          runId: '124',
          runAttempt: '2',
          profile: 'e2e',
        }[field],
      };
      await expect(verifyBuildArtifact(artifact, otherIdentity, publicKey)).rejects.toThrow();
    },
  );

  it.each(['modified', 'extra', 'missing'])('refuses %s output files', async (change) => {
    const { artifact, publicKey } = await fixture();
    const file = join(artifact, 'dist/index.html');
    if (change === 'modified') await writeFile(file, '<script>changed</script>');
    if (change === 'extra') await writeFile(join(artifact, 'dist/unexpected.js'), 'unexpected');
    if (change === 'missing') await rm(file);
    await expect(verifyBuildArtifact(artifact, identity, publicKey)).rejects.toThrow(
      'signed files',
    );
  });

  it('refuses a forged manifest even when the file hashes were rewritten', async () => {
    const { artifact, publicKey } = await fixture();
    const file = join(artifact, 'provenance.json');
    const envelope = JSON.parse(await readFile(file, 'utf8'));
    envelope.manifest.files[0].sha256 = '0'.repeat(64);
    await writeFile(file, JSON.stringify(envelope));
    await expect(verifyBuildArtifact(artifact, identity, publicKey)).rejects.toThrow('signature');
  });

  it('refuses a key substitution and absence of the trusted job output', async () => {
    const { artifact } = await fixture();
    const { publicKey } = generateKeyPairSync('ed25519');
    const otherKey = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    await expect(verifyBuildArtifact(artifact, identity, otherKey)).rejects.toThrow('signature');
    await expect(verifyBuildArtifact(artifact, identity, '')).rejects.toThrow('trusted');
  });

  it('refuses symbolic links in the downloaded tree', async () => {
    const { artifact, publicKey } = await fixture();
    await symlink('../provenance.json', join(artifact, 'dist/linked.json'));
    await expect(verifyBuildArtifact(artifact, identity, publicKey)).rejects.toThrow(
      'link or special',
    );
  });

  it('refuses to package a stale deployment identity', async () => {
    const { source, artifact } = await fixture();
    await writeFile(
      join(source, 'deployment-identity.json'),
      JSON.stringify({ commit: 'b'.repeat(40) }),
    );
    await expect(packageBuildArtifact(source, artifact, identity)).rejects.toThrow('producer SHA');
  });
});
