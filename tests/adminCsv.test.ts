import { describe, expect, it } from 'vitest';
import { type AdminRun, buildRunsCsv, escapeCsvCell } from '@/pages/adminPageUtils';

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
});
