import rawRegistry from '../../../config/authority-versions.json';

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
  progression: number;
  command: number;
  status: AuthorityVersionStatus;
  rulesetCode: string;
  contentHash: string;
  bundle: string;
  migration: string;
  features: AuthorityVersionFeatures;
}

export const AUTHORITY_VERSION_REGISTRY =
  rawRegistry.versions as readonly AuthorityVersionMetadata[];

export const CURRENT_AUTHORITY_VERSION = AUTHORITY_VERSION_REGISTRY.find(
  (version) => version.status === 'current',
) as AuthorityVersionMetadata;

export function getAuthorityVersion(engine: string): AuthorityVersionMetadata | undefined {
  return AUTHORITY_VERSION_REGISTRY.find((version) => version.engine === engine);
}
