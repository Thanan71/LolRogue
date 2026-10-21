import { describe, expect, it } from 'vitest';
import { getAdminRunExplorerCopy } from '@/i18n/adminRunExplorer';
import {
  AdminRunExportError,
  buildAdminExplorerCsv,
  validateRunExport,
} from '@/features/administration/domain/runs/adminRunExport';

describe('admin run export integrity', () => {
  const signal = new AbortController().signal;

  it('requires exactly the confirmed count and rejects duplicate or partial results', () => {
    const items = [{ id: '1' }, { id: '2' }];
    expect(validateRunExport(items, 2, 2, signal)).toBe(items);
    expect(() => validateRunExport(items, 3, 2, signal)).toThrow(AdminRunExportError);
    expect(() => validateRunExport(items, 3, 3, signal)).toThrow(AdminRunExportError);
    expect(() => validateRunExport([{ id: '1' }, { id: '1' }], 2, 2, signal)).toThrow(
      AdminRunExportError,
    );
    expect(() => validateRunExport([], Number.NaN, 0, signal)).toThrow(AdminRunExportError);
    expect(() => validateRunExport([], 5_001, 5_001, signal)).toThrow(AdminRunExportError);
  });

  it('never accepts a result after cancellation', () => {
    const request = new AbortController();
    request.abort();
    expect(() => validateRunExport([{ id: '1' }], 1, 1, request.signal)).toThrow(
      AdminRunExportError,
    );
  });

  it('keeps UTF-8, quotes and newlines while neutralizing spreadsheet formulas', () => {
    const csv = buildAdminExplorerCsv(
      ['Joueur', 'Équipement'],
      [
        ['=IMPORTXML("evil")', 'Épée, "dorée"\n雪'],
        ['\t@SUM(A1)', '+42'],
      ],
    );
    expect(csv).toBe(
      '\ufeff"Joueur","Équipement"\r\n"\'=IMPORTXML(""evil"")","Épée, ""dorée""\n雪"\r\n"\'\t@SUM(A1)","\'+42"',
    );
  });

  it('provides the same explorer and export messages in French and English', () => {
    expect(Object.keys(getAdminRunExplorerCopy('fr-FR')).sort()).toEqual(
      Object.keys(getAdminRunExplorerCopy('en-US')).sort(),
    );
    expect(getAdminRunExplorerCopy('en-US').exportCap).toContain('5,000');
  });
});
