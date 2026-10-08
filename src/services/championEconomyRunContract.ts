import type { ChampionRunAccessSnapshot } from '@/types/championEconomy';

/** Validate server snapshots without deriving ownership from local mastery. */
export function parseChampionRunAccessSnapshot(value: unknown): ChampionRunAccessSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const championIds = (ids: unknown): ids is string[] =>
    Array.isArray(ids) &&
    ids.length <= 100 &&
    ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 160) &&
    new Set(ids).size === ids.length;
  if (
    raw.version !== 1 ||
    typeof raw.enabled !== 'boolean' ||
    (raw.economyVersion !== null && raw.economyVersion !== 1) ||
    raw.enabled !== (raw.economyVersion === 1) ||
    !Number.isSafeInteger(raw.catalogVersion) ||
    typeof raw.catalogVersion !== 'number' ||
    raw.catalogVersion < 1 ||
    !championIds(raw.allowedChampionIds) ||
    !championIds(raw.rotationChampionIds)
  )
    return null;
  const rotationAbsent =
    raw.rotationId === null && raw.rotationStartsAt === null && raw.rotationEndsAt === null;
  const rotationPresent =
    typeof raw.rotationId === 'string' &&
    raw.rotationId.length > 0 &&
    typeof raw.rotationStartsAt === 'string' &&
    typeof raw.rotationEndsAt === 'string' &&
    Number.isFinite(Date.parse(raw.rotationStartsAt)) &&
    Number.isFinite(Date.parse(raw.rotationEndsAt)) &&
    Date.parse(raw.rotationStartsAt) < Date.parse(raw.rotationEndsAt);
  if ((!rotationAbsent && !rotationPresent) || (raw.enabled && !rotationPresent)) return null;
  return {
    version: 1,
    enabled: raw.enabled,
    economyVersion: raw.economyVersion,
    catalogVersion: raw.catalogVersion,
    rotationId: raw.rotationId as string | null,
    rotationStartsAt: raw.rotationStartsAt as string | null,
    rotationEndsAt: raw.rotationEndsAt as string | null,
    allowedChampionIds: [...raw.allowedChampionIds],
    rotationChampionIds: [...raw.rotationChampionIds],
  };
}
