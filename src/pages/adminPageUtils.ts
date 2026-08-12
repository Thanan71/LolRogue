import type { Run, RunTeamMember } from '@/types/models';

export interface AdminRun extends Run {
  player_username: string;
  player_display_name: string | null;
  team_members: RunTeamMember[];
}

export function formatAdminDate(dateString: string): string {
  return new Date(dateString).toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getLogLevelClass(level: string): string {
  return ['error', 'warn', 'info', 'debug'].includes(level)
    ? `admin-log-level--${level}`
    : 'admin-log-level--default';
}

const SPREADSHEET_FORMULA_PREFIX = /^\s*[=+\-@]/;

/** Quote one CSV cell and force spreadsheet formulas to remain inert text. */
export function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = SPREADSHEET_FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildRunsCsv(runs: readonly AdminRun[]): string {
  const headers = [
    'Run ID',
    'Seed',
    'Joueur',
    'Nom Affiché',
    'Victoire',
    'Niveau de Run',
    'Vagues Complétées',
    'Biomes Visités',
    'Nodes Complétés',
    'Combats Gagnés',
    'Combats Perdus',
    'Elite Kills',
    'Boss Kills',
    'Or Gagné',
    'Or Dépensé',
    'Total Kills',
    'Dégâts Infligés',
    'Dégâts Reçus',
    'Soins Donnés',
    'Soins Reçus',
    'Candies Gagnés',
    'Durée (secondes)',
    'Commencé le',
    'Complété le',
    'Champions Recrutés',
    'Items Achetés',
    'Équipe (Champions)',
    'Détails Champions',
  ];

  const rows = runs.map((run) => {
    const champions = run.team_members?.map((member) => member.champion_id).join('; ') || '';
    const details =
      run.team_members
        ?.map(
          (member) =>
            `${member.champion_id}: Niv${member.final_level} ${member.survived ? '✓' : '✗'} K:${member.kills} D:${member.damage_dealt} DR:${member.damage_received || 0} H:${member.healing_done || 0} HP:${member.final_hp}`,
        )
        .join(' | ') || '';

    return [
      run.run_uuid,
      run.seed || '',
      run.player_username || 'Unknown',
      run.player_display_name || run.player_username || 'Unknown',
      run.won ? 'Oui' : 'Non',
      run.run_level || 0,
      run.waves_completed || 0,
      run.biomes_visited?.join('; ') || '',
      run.nodes_completed || 0,
      run.combats_won || 0,
      run.combats_lost || 0,
      run.elite_kills || 0,
      run.boss_kills || 0,
      run.gold_earned || 0,
      run.total_gold_spent || 0,
      run.total_kills || 0,
      run.total_damage_dealt || 0,
      run.total_damage_received || 0,
      run.total_healing_done || 0,
      run.total_healing_received || 0,
      run.candies_earned || 0,
      run.duration_seconds || '',
      run.started_at ? formatAdminDate(run.started_at) : '',
      run.completed_at ? formatAdminDate(run.completed_at) : '',
      run.champions_recruited || 0,
      run.items_purchased || 0,
      champions,
      details,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return `\ufeff${[headers.map(escapeCsvCell).join(','), ...rows].join('\r\n')}`;
}

export function exportRunsToCSV(runs: AdminRun[]): void {
  if (runs.length === 0) return;

  const blob = new Blob([buildRunsCsv(runs)], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `runs_export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
