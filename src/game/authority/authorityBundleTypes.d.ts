/** Frozen JavaScript bundles are byte-checked against the published registry. */
declare module '*.bundle.js' {
  export function getAuthorityVerifier(engineVersion: string, contentHash: string): unknown;
}
