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
  it('orders semantic versions after historical date versions by publication sequence', () => {
    const historical = { ...fixture(4), version: '2026.10.10', publishedOn: '2026-10-10' };
    const semantic = { ...fixture(5), version: '0.2.0', publishedOn: '2026-10-11' };
    const catalog = [historical, semantic];
    expect(latestPatchNote(catalog)).toBe(semantic);
    expect(unreadPatchNotes(0, catalog).map((note) => note.version)).toEqual([
      '0.2.0',
      '2026.10.10',
    ]);
    expect(unreadPatchNotes(4, catalog)).toEqual([semantic]);
    expect(unreadPatchNotes(5, catalog)).toEqual([]);
  });
  it('publishes bilingual assist rules with a semantic version without rewriting historical notes', () => {
    const publication = latestPatchNote()!;
    expect(publication.version).toBe('0.2.0');
    expect(publication.publishedOn).toBe('2026-10-11');
    expect(publication.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(
      PATCH_NOTES.filter((note) => note.sequence < publication.sequence).map(
        (note) => note.version,
      ),
    ).toEqual(['2026.10.07', '2026.10.09', '2026.10.09.1', '2026.10.10']);
    for (const locale of ['fr-FR', 'en-US'] as const) {
      const text = publication.entries.map((entry) => entry.text[locale]).join(' ');
      expect(text).toMatch(/(?:assistances attribuées|Credited assists)/);
      expect(text).toContain('+1');
      expect(text).toContain('+3');
      expect(text).toContain('+10');
      expect(text).toContain('+200');
      expect(text).toContain('major.minor.patch');
    }
    const launch = PATCH_NOTES.find((note) => note.sequence === 3)!;
    expect(launch.entries.map((entry) => entry.text['en-US']).join(' ')).toContain(
      'killed with an ability',
    );
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
