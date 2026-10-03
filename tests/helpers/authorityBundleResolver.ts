import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { getAuthorityVerifier } from '@/game/authority';
import rawRegistry from '../../config/authority-versions.json';

export type AuthorityVerifier = NonNullable<ReturnType<typeof getAuthorityVerifier>>;

export async function resolveBundledAuthorityVerifier(
  engineVersion: string,
  contentHash: string,
): Promise<AuthorityVerifier | undefined> {
  const resolverUrl = pathToFileURL(
    resolve(process.cwd(), 'supabase/functions/verify-run/authority-version-resolver.generated.ts'),
  ).href;
  const edgeResolver = (await import(/* @vite-ignore */ resolverUrl)) as {
    resolveAuthorityVerifier: (
      engine: string,
      hash: string,
    ) => Promise<AuthorityVerifier | undefined>;
  };
  return edgeResolver.resolveAuthorityVerifier(engineVersion, contentHash);
}

export async function resolveRegisteredAuthorityVerifier(
  engineVersion: string,
  contentHash: string,
): Promise<AuthorityVerifier | undefined> {
  const version = rawRegistry.versions.find(
    (candidate) => candidate.engine === engineVersion && candidate.contentHash === contentHash,
  );
  if (!version) return undefined;

  const bundleUrl = pathToFileURL(resolve(process.cwd(), version.bundle)).href;
  const authority = (await import(/* @vite-ignore */ bundleUrl)) as {
    getAuthorityVerifier: (engine: string, hash: string) => AuthorityVerifier | undefined;
  };
  return authority.getAuthorityVerifier(engineVersion, contentHash);
}
