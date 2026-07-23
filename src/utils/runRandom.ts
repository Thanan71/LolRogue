import { SeededRNG } from './seededRandom';

function hashScope(scope: string): number {
  let hash = 2166136261;
  for (let index = 0; index < scope.length; index++) {
    hash ^= scope.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

/** Creates a reproducible random stream for one action within a persisted run. */
export function createScopedRunRng(seed: number | null, scope: string): SeededRNG {
  return new SeededRNG((seed ?? 0) ^ hashScope(scope));
}
