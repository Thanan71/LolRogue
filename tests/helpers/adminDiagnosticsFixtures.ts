import { randomUUID } from 'node:crypto';
import { type ExplorerAccount, explorerSql } from './adminExplorerFixtures';
export const diagnosticDay = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
export const diagnosticSqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;
export function seedDiagnosticLogs(
  account: ExplorerAccount,
  options: {
    count?: number;
    date?: string;
    sessionId?: string;
    attemptId?: string;
    unsafe?: boolean;
  } = {},
) {
  const ids = Array.from({ length: options.count ?? 1 }, () => randomUUID()).sort();
  const sessionId = options.sessionId ?? randomUUID();
  const date = options.date ?? `${diagnosticDay}T23:59:59.999999Z`;
  const details = JSON.stringify({
    ...(options.attemptId ? { attemptId: options.attemptId } : {}),
    token: 'secret-token-marker',
    ip: '192.0.2.99',
    payload: { command: 'sensitive-command-marker' },
  });
  explorerSql(`INSERT INTO public.logs(id,created_at,level,repository,method,operation,user_id,player_id,session_id,details,error_message,error_stack,table_name,duration_ms)
   SELECT unnest(ARRAY[${ids.map(diagnosticSqlText).join(',')}]::uuid[]),${diagnosticSqlText(date)}::timestamptz,'error',
   ${diagnosticSqlText(options.unsafe ? 'person@example.test' : 'SupabaseRunRepository')},'save','insert','${account.userId}','${account.playerId}',
   '${sessionId}',${diagnosticSqlText(details)}::jsonb,'Bearer secret-access-marker 192.0.2.99 sensitive-command-marker','secret-stack-marker','run_attempts',123.45;`);
  return { ids, sessionId };
}
export function cloneDiagnosticAttempt(
  account: ExplorerAccount,
  template: string,
  options: {
    id?: string;
    status?: 'expired' | 'rejected';
    startedAt?: string;
    finishedAt?: string;
    terminalAt?: string;
    engine?: string;
    code?: string;
  } = {},
) {
  const id = options.id ?? randomUUID();
  const status = options.status ?? 'expired';
  const started = options.startedAt ?? '2024-02-29T23:59:59.999999Z';
  const terminal = options.terminalAt ?? '2024-03-01T00:01:00.000000Z';
  const terminalFields =
    status === 'rejected'
      ? `gen_random_uuid(),0,repeat('a',64),${diagnosticSqlText(options.finishedAt ?? started)}::timestamptz,${diagnosticSqlText(terminal)}::timestamptz,NULL,${diagnosticSqlText(options.code ?? 'verification_failed')}`
      : `NULL,NULL,NULL,NULL,NULL,${diagnosticSqlText(terminal)}::timestamptz,NULL`;
  explorerSql(`INSERT INTO public.run_attempts(id,user_id,player_id,start_command_id,start_payload_hash,run_uuid,status,ruleset_version,gameplay_ruleset_version,engine_version,
   command_schema_version,gameplay_content_hash,seed,mode,difficulty,initial_team,started_at,expires_at,journal_hash,
   finish_command_id,sealed_sequence,sealed_journal_hash,finished_at,rejected_at,expired_at,rejection_code,created_at)
   SELECT '${id}','${account.userId}','${account.playerId}',gen_random_uuid(),start_payload_hash,'attempt_${id}','${status}',ruleset_version,gameplay_ruleset_version,
   ${options.engine ? diagnosticSqlText(options.engine) : 'engine_version'},command_schema_version,gameplay_content_hash,seed,mode,difficulty,initial_team,
   ${diagnosticSqlText(started)}::timestamptz,${diagnosticSqlText(started)}::timestamptz+interval '1 day',journal_hash,
   ${terminalFields},${diagnosticSqlText(started)}::timestamptz FROM public.run_attempts WHERE id='${template}';`);
  return id;
}
