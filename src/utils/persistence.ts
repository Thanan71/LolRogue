import type { StateStorage } from 'zustand/middleware';
import { recordTechnicalEvent } from './observability';
import {
  parseBoundedStorageJson,
  readStorageText,
  removeStorageEntry,
  writeStorageText,
} from './storagePolicy';

export const PERSISTENCE_QUARANTINE_PREFIX = 'lolrogue-quarantine:';
export const QUARANTINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function quarantineKey(name: string): string {
  return `${PERSISTENCE_QUARANTINE_PREFIX}${name}`;
}

export function quarantinePersistedState(name: string, payload: unknown, reason: string): void {
  try {
    recordTechnicalEvent({ type: 'rehydration_error', store: name, reason });
  } catch {
    // Diagnostics are not allowed to block recovery.
  }
  try {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const truncated = typeof serialized === 'string' && serialized.length > 2048;
    writeStorageText(
      quarantineKey(name),
      JSON.stringify({
        version: 1,
        quarantinedAt: new Date().toISOString(),
        reason: reason.slice(0, 200),
        payload: truncated ? serialized.slice(0, 2048) : payload,
        truncated,
      }),
    );
  } catch {
    // Non-serializable payloads are discarded too.
  }
  // Purging a bad source must still be attempted when writing the quarantine hits quota.
  removeStorageEntry(name);
}

export function getPersistedQuarantine(name: string): unknown | null {
  try {
    const key = quarantineKey(name);
    const raw = readStorageText(key);
    if (!raw) return null;
    const value = parseBoundedStorageJson(raw, key);
    const timestamp =
      isRecord(value) && typeof value.quarantinedAt === 'string'
        ? Date.parse(value.quarantinedAt)
        : NaN;
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !Number.isFinite(timestamp) ||
      timestamp > Date.now() ||
      Date.now() - timestamp >= QUARANTINE_TTL_MS
    ) {
      removeStorageEntry(key);
      return null;
    }
    return value;
  } catch {
    removeStorageEntry(quarantineKey(name));
    return null;
  }
}

/** Contain unavailable storage and discard only proven-invalid persisted state. */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    const raw = readStorageText(name);
    if (raw === null) return null;
    try {
      // Return the normalized envelope so versionless saves enter the v0 migration.
      return JSON.stringify(parseBoundedStorageJson(raw, name));
    } catch {
      quarantinePersistedState(name, raw, 'invalid_json_or_unreadable_storage');
      return null;
    }
  },
  setItem: writeStorageText,
  removeItem: removeStorageEntry,
};

export function recoverPersistedState<T extends object>(persisted: unknown, defaults: T): T {
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) return defaults;
  const recovered = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    if (
      Object.prototype.hasOwnProperty.call(persisted, key) &&
      typeof defaults[key] !== 'function'
    ) {
      recovered[key] = (persisted as T)[key];
    }
  }
  return recovered;
}

export interface VersionedRecoveryOptions<T extends object> {
  name: string;
  version: number;
  currentVersion: number;
  defaults: T;
  validate: (value: unknown) => value is Partial<T>;
  migrate?: (value: Partial<T>, version: number) => Partial<T> | null;
}

/** Validate before merging so malformed values can never replace safe defaults. */
export function recoverVersionedState<T extends object>(
  persisted: unknown,
  options: VersionedRecoveryOptions<T>,
): T {
  // Zustand merges undefined when its adapter cannot read a value. Absence
  // must not quarantine or delete a durable save that may still be valid.
  if (persisted === undefined) return options.defaults;
  try {
    if (
      !Number.isInteger(options.version) ||
      options.version < 0 ||
      options.version > options.currentVersion ||
      !options.validate(persisted)
    ) {
      quarantinePersistedState(options.name, persisted, 'unsupported_version_or_invalid_state');
      return options.defaults;
    }
    const migrated = options.migrate
      ? options.migrate(persisted, options.version)
      : (persisted as Partial<T>);
    if (!migrated || !options.validate(migrated)) {
      quarantinePersistedState(options.name, persisted, 'migration_failed_validation');
      return options.defaults;
    }
    return recoverPersistedState(migrated, options.defaults);
  } catch {
    quarantinePersistedState(options.name, persisted, 'migration_or_validation_threw');
    return options.defaults;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
