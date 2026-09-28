/** Pure browser-storage boundary: safe during locale bootstrap, without services. */
export const STORAGE_POLICIES = {
  'lolrogue-run-storage': { maxChars: 2 * 1024 * 1024, version: 7 },
  'lolrogue-settings': { maxChars: 16 * 1024, version: 3 },
  'lolrogue-audio': { maxChars: 16 * 1024, version: 2 },
  'lolrogue-mastery-storage': { maxChars: 512 * 1024, version: 3 },
  'lolrogue-daily-run': { maxChars: 16 * 1024, version: 4 },
  'lolrogue-daily-leaderboard': { maxChars: 256 * 1024 },
  'lolrogue-guest-mode': { maxChars: 4 * 1024 },
  'lolrogue:tutorial:map:v1': { maxChars: 4 * 1024 },
  'lolrogue:tutorial:combat:v1': { maxChars: 4 * 1024 },
  'lolrogue:tutorial:map:v2': { maxChars: 4 * 1024 },
  'lolrogue:tutorial:combat:v2': { maxChars: 4 * 1024 },
} as const;

export const STORAGE_MAX_DEPTH = 48;
export const STORAGE_MAX_NODES = 150_000;
export const STORAGE_MAX_ARRAY_LENGTH = 20_000;
export const QUARANTINE_MAX_CHARS = 16 * 1024;

export function storageMaxChars(name: string): number {
  return name.startsWith('lolrogue-quarantine:')
    ? QUARANTINE_MAX_CHARS
    : (STORAGE_POLICIES[name as keyof typeof STORAGE_POLICIES]?.maxChars ?? 16 * 1024);
}

export function removeStorageEntry(name: string): void {
  try {
    globalThis.localStorage.removeItem(name);
  } catch {
    // An unavailable backend never prevents the application from starting.
  }
}

/** Raw text only for the explicit legacy tutorial format; JSON callers must parse below. */
export function readStorageText(name: string): string | null {
  try {
    const raw = globalThis.localStorage.getItem(name);
    if (raw !== null && raw.length > storageMaxChars(name)) {
      removeStorageEntry(name);
      return null;
    }
    return raw;
  } catch {
    removeStorageEntry(name);
    return null;
  }
}

export function writeStorageText(name: string, value: string): void {
  if (value.length > storageMaxChars(name)) return;
  try {
    globalThis.localStorage.setItem(name, value);
  } catch {
    // In-memory state remains usable on quota/SecurityError, including getter failures.
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Shared by bootstrap and the settings store so invalid settings cannot select another locale. */
export function isStoredSettingsState(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    (value.textSize === undefined ||
      ['small', 'medium', 'large'].includes(value.textSize as string)) &&
    (value.language === undefined || value.language === 'fr-FR' || value.language === 'en-US') &&
    (value.battleSpeed === undefined ||
      value.battleSpeed === 1 ||
      value.battleSpeed === 2 ||
      value.battleSpeed === 3) &&
    (value.difficulty === undefined ||
      ['easy', 'normal', 'hard'].includes(value.difficulty as string)) &&
    (value.particlesEnabled === undefined || typeof value.particlesEnabled === 'boolean') &&
    (value.keyboardShortcutsEnabled === undefined ||
      typeof value.keyboardShortcutsEnabled === 'boolean')
  );
}

/** Check byte-independent UTF-16 length before parsing, then bounded iterative traversal. */
export function parseBoundedStorageJson(raw: string, name: string): unknown {
  if (raw.length > storageMaxChars(name)) throw new Error('storage_payload_too_large');
  const parsed: unknown = JSON.parse(raw);
  const pending = [{ value: parsed, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop();
    if (!entry) break;
    nodes += 1;
    if (nodes > STORAGE_MAX_NODES || entry.depth > STORAGE_MAX_DEPTH) {
      throw new Error('storage_structure_too_large');
    }
    if (typeof entry.value === 'number' && !Number.isFinite(entry.value)) {
      throw new Error('storage_non_finite_number');
    }
    if (entry.value === null || typeof entry.value !== 'object') continue;
    if (Array.isArray(entry.value) && entry.value.length > STORAGE_MAX_ARRAY_LENGTH) {
      throw new Error('storage_array_too_large');
    }
    const values = Object.entries(entry.value);
    if (nodes + pending.length + values.length > STORAGE_MAX_NODES) {
      throw new Error('storage_structure_too_large');
    }
    for (const [key, value] of values) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new Error('storage_unsafe_key');
      }
      pending.push({ value, depth: entry.depth + 1 });
    }
  }
  const policy = STORAGE_POLICIES[name as keyof typeof STORAGE_POLICIES];
  if (policy && 'version' in policy) {
    if (!record(parsed) || !record(parsed.state)) throw new Error('storage_invalid_envelope');
    // Versionless Zustand envelopes predate explicit schemas and must take the v0 migration.
    const version = parsed.version === undefined ? 0 : parsed.version;
    if (
      typeof version !== 'number' ||
      !Number.isInteger(version) ||
      version < 0 ||
      version > policy.version
    ) {
      throw new Error('storage_unsupported_version');
    }
    parsed.version = version;
    if (name === 'lolrogue-settings' && !isStoredSettingsState(parsed.state)) {
      throw new Error('storage_invalid_settings');
    }
  }
  return parsed;
}

export function readBoundedStorageJson(name: string): unknown | null {
  const raw = readStorageText(name);
  if (raw === null) return null;
  try {
    return parseBoundedStorageJson(raw, name);
  } catch {
    removeStorageEntry(name);
    return null;
  }
}
