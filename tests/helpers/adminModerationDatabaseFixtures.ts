import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type ExplorerAccount, explorerSql } from './adminExplorerFixtures';

export const moderationReason = 'Score reviewed against the authoritative evidence.';
export const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function moderationFixture(
  owner: ExplorerAccount,
  reporter: ExplorerAccount,
  options: { completed?: boolean; invalidated?: boolean; status?: string; createdAt?: string } = {},
) {
  const dailyRunId = randomUUID();
  const reportId = randomUUID();
  explorerSql(`INSERT INTO public.daily_runs(id,player_id,daily_date,daily_seed,score,completed_at)
    VALUES('${dailyRunId}','${owner.playerId}','2020-02-29',20200229,12345,
    ${options.completed === false ? 'NULL' : 'NOW()'});
    INSERT INTO public.daily_score_reports(id,daily_run_id,reporter_user_id,reason,status,created_at,reviewed_at)
    VALUES('${reportId}','${dailyRunId}','${reporter.userId}',${sqlText(moderationReason)},
    ${sqlText(options.status ?? 'open')},${options.createdAt ? sqlText(options.createdAt) : 'NOW()'},
    ${options.status && options.status !== 'open' ? 'NOW()' : 'NULL'});
    ${options.invalidated ? `UPDATE public.daily_runs SET invalidated_at=NOW(),invalidation_reason=${sqlText(moderationReason)} WHERE id='${dailyRunId}';` : ''}`);
  return { dailyRunId, reportId, dailyDate: '2020-02-29' };
}

export const moderationDecision = (
  fixture: ReturnType<typeof moderationFixture>,
  patch: Record<string, unknown> = {},
) => ({
  p_request_id: randomUUID(),
  p_report_id: fixture.reportId,
  p_confirmed_daily_run_id: fixture.dailyRunId,
  p_confirmed_daily_date: fixture.dailyDate,
  p_action: 'invalidate_score',
  p_reason: moderationReason,
  p_scope: 'daily_score',
  ...patch,
});

export async function decide(client: SupabaseClient, args: Record<string, unknown>) {
  const result = await client.rpc('admin_moderation_decide', args);
  if (result.error) throw result.error;
  return result.data as Record<string, unknown>;
}

export function clearModerationCounters(accounts: ExplorerAccount[]) {
  explorerSql(`DELETE FROM private.moderation_rate_windows
    WHERE actor_user_id IN(${accounts.map((account) => sqlText(account.userId)).join(',')})`);
}

/** Seed both adjacent UTC windows so the fixture survives a real clock boundary. */
export function seedModerationQuota(
  account: ExplorerAccount,
  kind: 'decision_minute' | 'decision_day' | 'report_minute' | 'report_day',
  attempts: number,
) {
  if (!Number.isSafeInteger(attempts) || attempts < 0) throw new Error('Invalid quota fixture.');
  const daily = kind.endsWith('_day');
  const start = daily
    ? "date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'"
    : "date_trunc('minute',NOW())";
  explorerSql(`INSERT INTO private.moderation_rate_windows(actor_user_id,kind,window_start,attempts)
    SELECT '${account.userId}',${sqlText(kind)},(${start})+n*INTERVAL '${daily ? '24 hours' : '1 minute'}',${attempts}
    FROM generate_series(0,1)n
    ON CONFLICT(actor_user_id,kind,window_start) DO UPDATE SET attempts=EXCLUDED.attempts;`);
}

export function clearModerationEvents(userIds: string[]) {
  if (userIds.length)
    explorerSql(`DELETE FROM private.moderation_events
      WHERE actor_user_id IN(${userIds.map(sqlText).join(',')})`);
}
