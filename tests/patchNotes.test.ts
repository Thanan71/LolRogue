// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latestPatchNote, PATCH_NOTES, type PatchNote, unreadPatchNotes } from '@/data/patchNotes';
import { getPatchNotesContent } from '@/i18n/patchNotesContent';
import { readPatchNotesState, writePatchNotesState } from '@/patchNotes/storage';
import { safeLocalStorage } from '@/utils/persistence';

const fixture = (sequence: number): PatchNote => ({
  sequence,
  version: `publication-${sequence}`,
  publishedOn: '2026-10-07',
  title: { 'fr-FR': `Publication ${sequence}`, 'en-US': `Publication ${sequence}` },
  entries: [],
});
describe('publication unread calculation', () => {
  it('shows all publications on first visit, latest first, without mutating the catalog', () => {
    const catalog = [fixture(2), fixture(1), fixture(3)];
    expect(unreadPatchNotes(0, catalog).map((note) => note.sequence)).toEqual([3, 2, 1]);
    expect(catalog.map((note) => note.sequence)).toEqual([2, 1, 3]);
  });
  it('groups only publications after the explicitly read sequence', () => {
    expect(
      unreadPatchNotes(1, [fixture(1), fixture(3), fixture(2)]).map((note) => note.sequence),
    ).toEqual([3, 2]);
    expect(unreadPatchNotes(3, [fixture(1), fixture(3)])).toEqual([]);
  });
  it('does not use versions, engine versions, dates or deployment SHAs to determine unread notes', () => {
    const republished = { ...fixture(1), publishedOn: '2027-01-01', version: 'another-build-sha' };
    expect(unreadPatchNotes(1, [republished])).toEqual([]);
    expect(unreadPatchNotes(1, [{ ...fixture(2), version: 'same-build-sha' }])).toHaveLength(1);
  });
  it.each([NaN, Infinity, -1, 1.5])(
    'treats malformed reading state %s as a first visit',
    (value) => {
      expect(unreadPatchNotes(value, [fixture(1)])).toHaveLength(1);
    },
  );
  it('keeps a future reading marker across an older application rollback', () => {
    expect(unreadPatchNotes(100, [fixture(1)])).toEqual([]);
  });
  it('requires explicit unique sequences, IDs, dates, categories and bilingual player entries', () => {
    expect(new Set(PATCH_NOTES.map((note) => note.sequence)).size).toBe(PATCH_NOTES.length);
    expect(new Set(PATCH_NOTES.map((note) => note.version)).size).toBe(PATCH_NOTES.length);
    for (const note of PATCH_NOTES) {
      expect(note.sequence).toBeGreaterThan(0);
      expect(note.publishedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(note.entries.length).toBeGreaterThan(0);
      for (const entry of note.entries) {
        expect(['new', 'balance', 'fixes']).toContain(entry.category);
        expect(entry.text['fr-FR']).toBeTruthy();
        expect(entry.text['en-US']).toBeTruthy();
      }
    }
    expect(latestPatchNote([])).toBeUndefined();
    expect(getPatchNotesContent('fr-FR').title).toBe('Notes de mise à jour');
    expect(getPatchNotesContent('en-US').title).toBe('Patch notes');
  });
});

describe('safe reading storage', () => {
  it('uses distinct versioned keys for guest and each account', () => {
    const record = {
      version: 1 as const,
      lastSeenSequence: 7,
      lastSeenVersion: 'publication-7',
      pendingSync: true,
    };
    writePatchNotesState('storage-account-a', record);
    expect(readPatchNotesState('storage-account-a')).toEqual(record);
    expect(readPatchNotesState('storage-account-b')).toBeNull();
    expect(localStorage.getItem('lolrogue:patch-notes:v1:storage-account-a')).toContain(
      'publication-7',
    );
  });
  it('rejects unsupported schema versions, invalid numbers and corrupt payloads', () => {
    for (const [index, invalid] of [
      { version: 9 },
      { version: 1, lastSeenSequence: -1 },
      null,
      'not-json',
    ].entries()) {
      localStorage.setItem(`lolrogue:patch-notes:v1:invalid-${index}`, JSON.stringify(invalid));
      expect(readPatchNotesState(`invalid-${index}`)).toBeNull();
    }
  });
  it('retains the reading marker in memory if browser storage becomes unavailable', () => {
    const read = vi.spyOn(safeLocalStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const write = vi.spyOn(safeLocalStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const record = {
      version: 1 as const,
      lastSeenSequence: 1,
      lastSeenVersion: 'publication-1',
      pendingSync: false,
    };
    expect(() => writePatchNotesState('blocked-storage', record)).not.toThrow();
    expect(readPatchNotesState('blocked-storage')).toEqual(record);
    read.mockRestore();
    write.mockRestore();
  });
});
