import { getAdminExportContent } from '@/i18n/adminExportContent';
import { championContent } from '@/i18n/championContent';
import { type Locale, locale } from '@/i18n/fr';
import type { Run, RunTeamMember } from '@/types/models';

export interface AdminRun extends Run {
  player_username: string;
  player_display_name: string | null;
  team_members: RunTeamMember[];
}

export function formatAdminDate(dateString: string, selectedLocale: Locale = locale): string {
  return new Intl.DateTimeFormat(selectedLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function formatAdminDay(dateString: string, selectedLocale: Locale = locale): string {
  return new Intl.DateTimeFormat(selectedLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(`${dateString}T00:00:00`));
}

export function formatAdminNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
  selectedLocale: Locale = locale,
): string {
  return new Intl.NumberFormat(selectedLocale, options).format(value);
}

export function formatAdminPercent(value: number, selectedLocale: Locale = locale): string {
  return new Intl.NumberFormat(selectedLocale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatAdminSignedNumber(
  value: number,
  digits = 1,
  selectedLocale: Locale = locale,
): string {
  return formatAdminNumber(
    value,
    {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: 'exceptZero',
    },
    selectedLocale,
  );
}

export function formatAdminCount(
  value: number,
  singular: string,
  pluralForm: string,
  selectedLocale: Locale = locale,
): string {
  const form = new Intl.PluralRules(selectedLocale).select(value) === 'one' ? singular : pluralForm;
  return `${formatAdminNumber(value, {}, selectedLocale)} ${form}`;
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

export function buildRunsCsv(runs: readonly AdminRun[], selectedLocale: Locale = locale): string {
  const copy = getAdminExportContent(selectedLocale);
  const number = (value: number | null | undefined) =>
    formatAdminNumber(value ?? 0, {}, selectedLocale);

  const rows = runs.map((run) => {
    const champions =
      run.team_members
        ?.map(
          (member) =>
            championContent[selectedLocale][member.champion_id]?.name ?? member.champion_id,
        )
        .join('; ') || '';
    const details =
      run.team_members
        ?.map((member) => {
          const championName =
            championContent[selectedLocale][member.champion_id]?.name ?? member.champion_id;
          const labels = copy.championDetails;
          const detail = (label: string, value: string) =>
            `${label}${labels.labelSeparator}${value}`;

          return [
            `${championName}${labels.nameSeparator}${labels.level} ${number(member.final_level)}`,
            detail(labels.survived, member.survived ? copy.yes : copy.no),
            detail(labels.kills, number(member.kills)),
            detail(labels.damageDealt, number(member.damage_dealt)),
            detail(labels.damageReceived, number(member.damage_received)),
            detail(labels.healingDone, number(member.healing_done)),
            detail(labels.finalHealth, number(member.final_hp)),
          ].join(' · ');
        })
        .join(' | ') || '';

    return [
      run.run_uuid,
      run.seed || '',
      run.player_username || copy.unknown,
      run.player_display_name || run.player_username || copy.unknown,
      run.won ? copy.yes : copy.no,
      number(run.run_level),
      number(run.waves_completed),
      run.biomes_visited
        ?.map((biomeId) => copy.biomes[biomeId as keyof typeof copy.biomes] ?? biomeId)
        .join('; ') || '',
      number(run.nodes_completed),
      number(run.combats_won),
      number(run.combats_lost),
      number(run.elite_kills),
      number(run.boss_kills),
      number(run.gold_earned),
      number(run.total_gold_spent),
      number(run.total_kills),
      number(run.total_damage_dealt),
      number(run.total_damage_received),
      number(run.total_healing_done),
      number(run.total_healing_received),
      number(run.candies_earned),
      run.duration_seconds ? number(run.duration_seconds) : '',
      run.started_at ? formatAdminDate(run.started_at, selectedLocale) : '',
      run.completed_at ? formatAdminDate(run.completed_at, selectedLocale) : '',
      number(run.champions_recruited),
      number(run.items_purchased),
      champions,
      details,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return `\ufeff${[copy.headers.map(escapeCsvCell).join(','), ...rows].join('\r\n')}`;
}

export function buildRunsExportFilename(
  exportedAt: Date = new Date(),
  selectedLocale: Locale = locale,
): string {
  const date = exportedAt.toISOString().slice(0, 10);
  return `${getAdminExportContent(selectedLocale).fileNamePrefix}_${date}.csv`;
}

export function exportRunsToCSV(
  runs: AdminRun[],
  selectedLocale: Locale = locale,
  exportedAt: Date = new Date(),
): void {
  if (runs.length === 0) return;

  const blob = new Blob([buildRunsCsv(runs, selectedLocale)], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildRunsExportFilename(exportedAt, selectedLocale);
  link.click();
  URL.revokeObjectURL(url);
}
