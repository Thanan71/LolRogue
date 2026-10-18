import { randomUUID } from 'node:crypto';
import type { ExplorerAccount } from './adminExplorerFixtures';
import { explorerSql } from './adminExplorerFixtures';

export const analyticsSnapshot = '2024-04-10T12:00:00Z';
export const analyticsMarker = '2024-01-01T12:00:00Z';
export function analyticsAttempt(
  templateId: string,
  account: ExplorerAccount,
  start: string,
  overrides: Record<string, unknown> = {},
) {
  const id = randomUUID();
  const values = {
    id,
    user_id: account.userId,
    player_id: account.playerId,
    run_uuid: `attempt_${id}`,
    start_command_id: randomUUID(),
    status: 'expired',
    started_at: start,
    created_at: start,
    expires_at: new Date(Date.parse(start) + 3_600_000).toISOString(),
    expired_at: new Date(Date.parse(start) + 3_600_000).toISOString(),
    ...overrides,
  };
  const json = JSON.stringify(values).split("'").join("''");
  return {
    id,
    sql: `INSERT INTO public.run_attempts SELECT (jsonb_populate_record(NULL::public.run_attempts,to_jsonb(t)||'${json}'::jsonb)).* FROM public.run_attempts t WHERE t.id='${templateId}';`,
  };
}
export function analyticsFinish(attemptId: string, account: ExplorerAccount, at: string) {
  const id = randomUUID();
  return `INSERT INTO public.runs(id,player_id,run_uuid,won,waves_completed,run_level,progression_version,progression_source,run_attempt_id,created_at,completed_at)
    VALUES('${id}','${account.playerId}','analytics_${id}',TRUE,3,2,3,'verified','${attemptId}','${at}','${at}');
    UPDATE public.run_attempts SET status='verified',expired_at=NULL,finish_command_id=gen_random_uuid(),finished_at='${at}',verified_at='${at}',result_run_id='${id}',result_hash=repeat('e',64),result='{}',response='{}' WHERE id='${attemptId}';`;
}
export function analyticsCombat(attemptId: string, at: string, sequence = 1) {
  return `INSERT INTO public.run_attempt_commands(attempt_id,sequence,command_id,kind,payload,payload_hash,previous_hash,chain_hash,received_at)
  VALUES('${attemptId}',${sequence},gen_random_uuid(),'resolve_combat','{}',repeat('a',64),repeat('b',64),repeat('c',64),'${at}');`;
}
export function analyticsScenario(
  admin: ExplorerAccount,
  accounts: ExplorerAccount[],
  setup: string,
  query: string,
  options: { marker?: string; signup?: string; snapshot?: string; timezone?: string } = {},
) {
  // Temporal fixtures are confined to this disposable LOCAL transaction. Disabling
  // triggers here permits historical rows and a coverage marker for maturity tests;
  // neither the production marker nor the trigger definition is ever rewritten.
  const result = explorerSql(`BEGIN;
    SET LOCAL session_replication_role='replica';
    UPDATE private.admin_analytics_coverage SET started_at='${options.marker ?? analyticsMarker}';
    UPDATE public.players SET created_at='${options.signup ?? '2024-02-01T00:00:00Z'}' WHERE id IN(${accounts.map((a) => `'${a.playerId}'`).join(',')});
    ${setup}
    SET LOCAL session_replication_role='origin';
    SET LOCAL TIME ZONE '${options.timezone ?? 'UTC'}';
    SELECT set_config('request.jwt.claims','{"sub":"${admin.userId}","role":"authenticated"}',TRUE);
    SET LOCAL ROLE authenticated;
    SELECT ${query};
    ROLLBACK;`);
  return JSON.parse(
    result
      .split('\n')
      .reverse()
      .find((line) => line.startsWith('{') || line.startsWith('['))!,
  );
}
export function analyticsRpc(
  resource: 'series' | 'retention' | 'funnel',
  filters: object,
  snapshot = analyticsSnapshot,
) {
  return `public.admin_analytics_${resource}('${JSON.stringify(filters).split("'").join("''")}'::jsonb,'${snapshot}')`;
}
