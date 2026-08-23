import {
  AUTHORITY_ENGINE_FEATURE_MASKS,
  AUTHORITY_FEATURE_BITS,
  CURRENT_AUTHORITY_VERSION,
} from './versionCapabilities.generated';

export { CURRENT_AUTHORITY_VERSION };

export type AuthorityVersionStatus = 'current' | 'replay-only' | 'unsupported';

export interface AuthorityVersionFeatures {
  canonicalProgression: boolean;
  manualCombat: boolean;
  canonicalEncounters: boolean;
  combatActionTrace: boolean;
  runLedger: boolean;
  mastery: boolean;
  domainInvariants: boolean;
  clientAuthorityParity: boolean;
  automaticTraceSuffix: boolean;
  canonicalStats: boolean;
  contentBalance: boolean;
}

export interface AuthorityVersionMetadata {
  engine: string;
  gameplay: number;
  dailyScore: number;
  progression: number;
  command: number;
  status: AuthorityVersionStatus;
  rulesetCode: string;
  contentHash: string;
  bundle: string;
  migration: string;
  features: AuthorityVersionFeatures;
}

export type AuthorityFeature = keyof typeof AUTHORITY_FEATURE_BITS;

function getAuthorityFeatureMask(engine: string): number | undefined {
  const match = /^run-engine-v([1-9]\d*)$/.exec(engine);
  return match ? AUTHORITY_ENGINE_FEATURE_MASKS[Number(match[1])] : undefined;
}

export function isKnownAuthorityEngine(engine: string): boolean {
  const mask = getAuthorityFeatureMask(engine);
  return mask !== undefined && mask >= 0;
}

export function hasAuthorityFeature(engine: string, feature: AuthorityFeature): boolean {
  const mask = getAuthorityFeatureMask(engine);
  return mask !== undefined && mask >= 0 && (mask & AUTHORITY_FEATURE_BITS[feature]) !== 0;
}
