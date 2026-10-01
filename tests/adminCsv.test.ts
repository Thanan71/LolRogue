import { describe, expect, it } from 'vitest';
import {
  type AdminRun,
  buildRunsCsv,
  buildRunsExportFilename,
  escapeCsvCell,
  formatAdminDate,
} from '@/pages/adminPageUtils';

describe('admin CSV export', () => {
  it.each(['=2+2', ' +SUM(A1:A2)', '\t-10+20', '\n@IMPORT', '  @cmd'])(
    'neutralizes spreadsheet formula prefix %j',
    (payload) => {
      expect(escapeCsvCell(payload)).toBe(`"'${payload.replace(/"/g, '""')}"`);
    },
  );

  it('quotes commas, quotes and line breaks without changing safe text', () => {
    expect(escapeCsvCell('Garen, "Demacia"\nTank')).toBe('"Garen, ""Demacia""\nTank"');
    expect(escapeCsvCell('ordinary player')).toBe('"ordinary player"');
  });

  it('sanitizes every user-controlled run field in the generated document', () => {
    const run = {
      run_uuid: 'run-1',
      player_username: '=HYPERLINK("https://invalid")',
      player_display_name: '  +1, "quoted"\nline',
      won: true,
      biomes_visited: ['top_lane'],
      team_members: [
        {
          champion_id: '@COMMAND',
          final_level: 1,
          survived: true,
          kills: 0,
          damage_dealt: 0,
          damage_received: 0,
          healing_done: 0,
          final_hp: 1,
        },
      ],
    } as AdminRun;

    const csv = buildRunsCsv([run]);
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""https://invalid"")"');
    expect(csv).toContain('"\'  +1, ""quoted""\nline"');
    expect(csv).toContain("'@COMMAND");
    expect(csv).toContain('\r\n');
  });

  it('localizes headers, values, champion details, dates, numbers and filenames', () => {
    const timestamp = '2026-08-09T12:10:00.000Z';
    const run = {
      run_uuid: 'run-2',
      player_username: '',
      player_display_name: null,
      won: false,
      run_level: 12_345,
      gold_earned: 12_345,
      biomes_visited: ['top_lane'],
      started_at: timestamp,
      completed_at: timestamp,
      team_members: [
        {
          champion_id: 'Zoe',
          final_level: 12,
          survived: false,
          kills: 12_345,
          damage_dealt: 12_345,
          damage_received: 2_345,
          healing_done: 1_234,
          final_hp: 345,
        },
      ],
    } as AdminRun;

    const french = buildRunsCsv([run], 'fr-FR');
    const english = buildRunsCsv([run], 'en-US');

    expect(french).toContain('\ufeff"ID de partie","Graine","Joueur","Nom affiché"');
    expect(english).toContain('\ufeff"Run ID","Seed","Player","Display name"');
    expect(french).toContain('"Inconnu","Inconnu","Non"');
    expect(english).toContain('"Unknown","Unknown","No"');
    expect(buildRunsCsv([{ ...run, won: true }], 'fr-FR')).toContain('"Oui"');
    expect(buildRunsCsv([{ ...run, won: true }], 'en-US')).toContain('"Yes"');
    expect(french).toContain('"12 345"');
    expect(english).toContain('"12,345"');
    expect(french).toContain('"Voie du haut"');
    expect(english).toContain('"Top lane"');
    expect(french).toContain(`"${formatAdminDate(timestamp, 'fr-FR')}"`);
    expect(english).toContain(`"${formatAdminDate(timestamp, 'en-US')}"`);
    expect(french).toContain('Zoé : niveau 12 · survie : Non · éliminations : 12 345');
    expect(english).toContain('Zoe: level 12 · survived: No · kills: 12,345');
    expect(buildRunsExportFilename(new Date(timestamp), 'fr-FR')).toBe(
      'export_parties_2026-08-09.csv',
    );
    expect(buildRunsExportFilename(new Date(timestamp), 'en-US')).toBe(
      'runs_export_2026-08-09.csv',
    );
  });
});
