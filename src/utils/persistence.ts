import type { StateStorage } from 'zustand/middleware';
import { recordTechnicalEvent } from './observability';

export const PERSISTENCE_QUARANTINE_PREFIX = 'lolrogue-quarantine:';

function quarantineKey(name: string): string {
  return `${PERSISTENCE_QUARANTINE_PREFIX}${name}`;
}

export function quarantinePersistedState(name: string, payload: unknown, reason: string): void {
  recordTechnicalEvent({ type: 'rehydration_error', store: name, reason });
  try {
    localStorage.setItem(
      quarantineKey(name),
      JSON.stringify({ quarantinedAt: new Date().toISOString(), reason, payload }),
    );
    localStorage.removeItem(name);
  } catch {
    // Recovery must still return defaults when storage is unavailable or full.
  }
}

export function getPersistedQuarantine(name: string): unknown | null {
  try {
    const raw = localStorage.getItem(quarantineKey(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** localStorage adapter that discards unreadable persisted state instead of crashing startup. */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      const raw = localStorage.getItem(name);
      if (raw !== null) JSON.parse(raw);
      return raw;
    } catch {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(name);
      } catch {
        // The backend itself is unreadable.
      }
      quarantinePersistedState(name, raw, 'invalid_json_or_unreadable_storage');
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Storage can be unavailable or full; the in-memory store remains usable.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Nothing else can be done when storage is unavailable.
    }
  },
};

export function recoverPersistedState<T extends object>(persisted: unknown, defaults: T): T {
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) return defaults;
  return { ...defaults, ...(persisted as Partial<T>) };
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
  return { ...options.defaults, ...migrated };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
