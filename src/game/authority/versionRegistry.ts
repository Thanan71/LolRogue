import {
  AUTHORITY_ENGINE_CHAMPION_CATALOGS,
  AUTHORITY_ENGINE_FEATURE_MASKS,
  AUTHORITY_ENGINE_VERSION_ORDINALS,
  AUTHORITY_FEATURE_BITS,
  AUTHORITY_GAMEPLAY_RELEASE_LABELS,
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
  runProgression: boolean;
  runProgressionAssists: boolean;
}

export interface AuthorityVersionMetadata {
  engine: string;
  gameplay: number;
  dailyScore: number;
  progression: number;
  command: number;
  championCatalog: number;
  status: AuthorityVersionStatus;
  rulesetCode: string;
  contentHash: string;
  bundle: string;
  migration: string;
  features: AuthorityVersionFeatures;
}

export type AuthorityFeature = keyof typeof AUTHORITY_FEATURE_BITS;

function getAuthorityEngineOrdinal(engine: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(AUTHORITY_ENGINE_VERSION_ORDINALS, engine)
    ? AUTHORITY_ENGINE_VERSION_ORDINALS[engine]
    : undefined;
}

function getAuthorityFeatureMask(engine: string): number | undefined {
  const ordinal = getAuthorityEngineOrdinal(engine);
  return ordinal === undefined ? undefined : AUTHORITY_ENGINE_FEATURE_MASKS[ordinal];
}

export function isKnownAuthorityEngine(engine: string): boolean {
  const mask = getAuthorityFeatureMask(engine);
  return mask !== undefined && mask >= 0;
}

export function getAuthorityChampionCatalogVersion(engine: string): number | undefined {
  const ordinal = getAuthorityEngineOrdinal(engine);
  const catalog = ordinal === undefined ? undefined : AUTHORITY_ENGINE_CHAMPION_CATALOGS[ordinal];
  return catalog !== undefined && catalog > 0 ? catalog : undefined;
}

export function hasAuthorityFeature(engine: string, feature: AuthorityFeature): boolean {
  const mask = getAuthorityFeatureMask(engine);
  return mask !== undefined && mask >= 0 && (mask & AUTHORITY_FEATURE_BITS[feature]) !== 0;
}

/** Public release labels; legacy ordinal versions retain their original display. */
export function getAuthorityGameplayVersionLabel(gameplay: number): string {
  return AUTHORITY_GAMEPLAY_RELEASE_LABELS[gameplay] ?? String(gameplay);
}
