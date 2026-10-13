import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function artifactPath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').some((part) => !part || part === '..' || part === '.')
  ) {
    throw new Error('Generated artifacts: unsafe repository path.');
  }
  return value;
}

async function listFiles(root, relative) {
  const absolute = path.join(root, artifactPath(relative));
  const info = await lstat(absolute);
  if (info.isSymbolicLink())
    throw new Error(`Generated artifacts: symlink is forbidden: ${relative}`);
  if (info.isFile()) return [relative];
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) files.push(...(await listFiles(root, `${relative}/${entry.name}`)));
  return files.sort();
}

/** All inputs are retained in memory; no generator, lock or report is written. */
export function createArtifactSnapshot(root, { readBytes = readFile, enumerate = listFiles } = {}) {
  const contents = new Map();
  const listings = new Map();
  return {
    async read(relative) {
      artifactPath(relative);
      if (!contents.has(relative)) {
        try {
          contents.set(relative, Buffer.from(await readBytes(path.join(root, relative))));
        } catch (error) {
          throw new Error(
            `Generated artifacts: cannot read ${relative} (${error.code ?? 'read error'}).`,
          );
        }
      }
      return contents.get(relative);
    },
    async json(relative) {
      try {
        return JSON.parse((await this.read(relative)).toString('utf8'));
      } catch (error) {
        if (error.message.startsWith('Generated artifacts:')) throw error;
        throw new Error(`Generated artifacts: invalid JSON: ${relative}.`);
      }
    },
    async list(relative) {
      if (!listings.has(relative)) {
        try {
          listings.set(relative, await enumerate(root, artifactPath(relative)));
        } catch (error) {
          throw new Error(
            `Generated artifacts: cannot enumerate ${relative} (${error.code ?? error.message}).`,
          );
        }
      }
      return listings.get(relative);
    },
    async assertUnchanged() {
      for (const [relative, initial] of contents) {
        let latest;
        try {
          latest = await readBytes(path.join(root, relative));
        } catch {
          throw new Error(
            `Generated artifacts: input disappeared during check: ${relative}. Retry after generation finishes.`,
          );
        }
        if (sha256(initial) !== sha256(latest)) {
          throw new Error(
            `Generated artifacts: concurrent change detected: ${relative}. Retry after generation finishes.`,
          );
        }
      }
      for (const [relative, initial] of listings) {
        let latest;
        try {
          latest = await enumerate(root, relative);
        } catch {
          throw new Error(
            `Generated artifacts: directory changed during check: ${relative}. Retry after generation finishes.`,
          );
        }
        if (JSON.stringify(initial) !== JSON.stringify(latest)) {
          throw new Error(
            `Generated artifacts: concurrent directory change detected: ${relative}. Retry after generation finishes.`,
          );
        }
      }
    },
  };
}
