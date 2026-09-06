import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { getAuthorityVerifier } from '@/game/authority';

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
