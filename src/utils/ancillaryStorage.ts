import {
  parseBoundedStorageJson,
  readStorageText,
  removeStorageEntry,
  writeStorageText,
} from './storagePolicy';

const GUEST_MODE_KEY = 'lolrogue-guest-mode';
const TUTORIAL_LEGACY_KEYS = {
  'lolrogue:tutorial:map:v2': 'lolrogue:tutorial:map:v1',
  'lolrogue:tutorial:combat:v2': 'lolrogue:tutorial:combat:v1',
} as const;

export type TutorialStorageKey = keyof typeof TUTORIAL_LEGACY_KEYS;

function readCache(name: string): { value: unknown } | null {
  const raw = readStorageText(name);
  if (raw === null) return null;
  try {
    return { value: parseBoundedStorageJson(raw, name) };
  } catch {
    removeStorageEntry(name);
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTutorialCompletion(value: unknown): boolean {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.state)) return false;
  const { completed, completedAt } = value.state;
  return (
    completed === true &&
    typeof completedAt === 'string' &&
    completedAt.length === 24 &&
    Number.isFinite(Date.parse(completedAt)) &&
    new Date(completedAt).toISOString() === completedAt
  );
}

/** A revision invalidates only this tutorial's cache; unrelated browser data is untouched. */
export function readTutorialCompleted(key: TutorialStorageKey): boolean {
  const current = readCache(key);
  if (isTutorialCompletion(current?.value)) {
    removeStorageEntry(TUTORIAL_LEGACY_KEYS[key]);
    return true;
  }
  if (current !== null) removeStorageEntry(key);
  const legacyKey = TUTORIAL_LEGACY_KEYS[key];
  const legacy = readStorageText(legacyKey);
  if (legacy !== 'done') {
    if (legacy !== null) removeStorageEntry(legacyKey);
    return false;
  }
  markTutorialCompleted(key);
  return true;
}

export function markTutorialCompleted(key: TutorialStorageKey): void {
  const value = JSON.stringify({
    version: 2,
    state: { completed: true, completedAt: new Date().toISOString() },
  });
  writeStorageText(key, value);
  // A blocked/quota write must not erase the only valid legacy completion.
  if (readStorageText(key) === value) removeStorageEntry(TUTORIAL_LEGACY_KEYS[key]);
}

export function readGuestMode(): boolean {
  const stored = readCache(GUEST_MODE_KEY);
  const value = stored?.value;
  if (value === true) {
    setStoredGuestMode(true);
    return true;
  }
  if (
    isRecord(value) &&
    value.version === 1 &&
    isRecord(value.state) &&
    value.state.enabled === true
  ) {
    return true;
  }
  if (stored !== null) removeStorageEntry(GUEST_MODE_KEY);
  return false;
}

export function setStoredGuestMode(enabled: boolean): void {
  if (enabled) {
    writeStorageText(GUEST_MODE_KEY, JSON.stringify({ version: 1, state: { enabled: true } }));
  } else {
    removeStorageEntry(GUEST_MODE_KEY);
  }
}
