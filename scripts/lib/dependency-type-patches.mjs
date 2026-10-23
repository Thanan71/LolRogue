import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Declaration-only corrections, reviewed against these exact published tarballs.
// The SDK legacy toJSON payload differs from the modern DOM; React 19 scopes JSX to react.
export const dependencyTypePatches = [
  {
    package: '@supabase/auth-js',
    version: '2.117.2',
    targets: ['dist/main/lib/webauthn.dom.d.ts', 'dist/module/lib/webauthn.dom.d.ts'],
    before:
      'export interface PublicKeyCredentialFuture<T extends PublicKeyCredentialJSON = PublicKeyCredentialJSON> extends PublicKeyCredential {',
    after:
      "export interface PublicKeyCredentialFuture<T extends PublicKeyCredentialJSON = PublicKeyCredentialJSON> extends Omit<PublicKeyCredential, 'toJSON'> {",
    originalSha256: '6b5b828d450e54fb2d69d3556aebcdb90d2cd7a98112147c7e41f7bd6f52ea67',
    patchedSha256: 'f6dd50628c003b3b3c5029aa93aa218119400f3a3cdba2595ba451c5f32a152f',
  },
  {
    package: '@vercel/speed-insights',
    version: '2.0.0',
    targets: ['dist/react/index.d.ts', 'dist/react/index.d.mts'],
    before: '): JSX.Element | null;',
    after: "): import('react').JSX.Element | null;",
    originalSha256: '6f3a6b4fa4b411592cef99a5e78e33188813a26bf0793eb61441dc204dcae9e3',
    patchedSha256: '6a7db8168baafa4f41512a91ab9bda69aa9411ee9d82ddf9d7344be4d4c83043',
  },
];

const digest = (source) => createHash('sha256').update(source).digest('hex');

/** Validate every version and complete file before writing any declaration. */
export function applyDependencyTypePatches(root) {
  const changes = dependencyTypePatches.flatMap((patch) => {
    const directory = path.join(root, 'node_modules', patch.package);
    const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    if (manifest.name !== patch.package || manifest.version !== patch.version) {
      throw new Error(`Declaration patch requires ${patch.package}@${patch.version}.`);
    }
    return patch.targets.map((target) => {
      const file = path.join(directory, target);
      const source = readFileSync(file, 'utf8');
      if (digest(source) === patch.patchedSha256) return { file, source, changed: false };
      if (digest(source) !== patch.originalSha256) {
        throw new Error(`Declaration patch content diverged: ${patch.package}/${target}.`);
      }
      const patched = source.replaceAll(patch.before, patch.after);
      if (digest(patched) !== patch.patchedSha256) {
        throw new Error(`Declaration patch result diverged: ${patch.package}/${target}.`);
      }
      return { file, source: patched, changed: true };
    });
  });
  for (const { file, source, changed } of changes) {
    if (changed) writeFileSync(file, source);
  }
  return changes.filter(({ changed }) => changed).length;
}
