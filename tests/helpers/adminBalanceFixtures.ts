import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { ExplorerAccount } from './adminExplorerFixtures';
import { explorerSql } from './adminExplorerFixtures';

export const balanceFilters = { from: '2024-02-01', to: '2024-02-01' };
export const balanceSnapshot = '2024-02-02T12:00:00Z';
export function balanceRpc(resource: 'champions' | 'builds', filters: object = balanceFilters) {
  return `public.admin_balance_${resource}('${JSON.stringify(filters).split("'").join("''")}'::jsonb,'${balanceSnapshot}')`;
}
export function balanceScenario(
  admin: ExplorerAccount,
  accounts: ExplorerAccount[],
  setup: string,
  query: string,
  options: { diagnostics?: boolean } = {},
) {
  const diagnostic = options.diagnostics
    ? { started: performance.now(), cpu: process.cpuUsage(), memory: process.memoryUsage() }
    : null;
  const marker = (phase: string) =>
    diagnostic ? `\\echo BALANCE_DIAGNOSTIC_${phase.toUpperCase()}\n` : '';
  const result = explorerSql(`${diagnostic ? '\\timing on\n' : ''}${marker('setup')}BEGIN;
    SET LOCAL session_replication_role='replica';
    UPDATE public.players SET created_at='2024-01-01' WHERE id IN(${accounts.map((a) => `'${a.playerId}'`).join(',')});
    ${setup}
    ${marker('auth')}SET LOCAL session_replication_role='origin';
    SELECT set_config('request.jwt.claims','{"sub":"${admin.userId}","role":"authenticated"}',TRUE);
    SET LOCAL ROLE authenticated;
    ${marker('rpc')}SELECT ${query};
    ${marker('rollback')}ROLLBACK;`);
  const value = JSON.parse(
    result
      .split('\n')
      .reverse()
      .find((line) => line.startsWith('{') || line.startsWith('['))!,
  );
  if (diagnostic) {
    const wallMs = performance.now() - diagnostic.started;
    const cpu = process.cpuUsage(diagnostic.cpu);
    const memory = process.memoryUsage();
    const psqlMs = { setup: 0, auth: 0, rpc: 0, rollback: 0 };
    const setupStatementsMs: number[] = [];
    let phase: keyof typeof psqlMs = 'setup';
    for (const line of result.split('\n')) {
      if (line === 'BALANCE_DIAGNOSTIC_AUTH') phase = 'auth';
      else if (line === 'BALANCE_DIAGNOSTIC_RPC') phase = 'rpc';
      else if (line === 'BALANCE_DIAGNOSTIC_ROLLBACK') phase = 'rollback';
      const timing = /^Time: ([\d.]+) ms(?:\s|$)/.exec(line);
      if (!timing) continue;
      const milliseconds = Number(timing[1]);
      psqlMs[phase] += milliseconds;
      if (phase === 'setup') setupStatementsMs.push(milliseconds);
    }
    const round = (number: number) => Math.round(number * 100) / 100;
    console.info(
      '[adminBalance population diagnostic]',
      JSON.stringify({
        nodeWallMs: round(wallMs),
        nodeCpuMs: { user: round(cpu.user / 1000), system: round(cpu.system / 1000) },
        memoryMiB: {
          rssBefore: round(diagnostic.memory.rss / 1024 ** 2),
          rssAfter: round(memory.rss / 1024 ** 2),
          heapBefore: round(diagnostic.memory.heapUsed / 1024 ** 2),
          heapAfter: round(memory.heapUsed / 1024 ** 2),
        },
        psqlMs: Object.fromEntries(Object.entries(psqlMs).map(([key, ms]) => [key, round(ms)])),
        setupStatementsMs,
      }),
    );
  }
  return value;
}
export function balanceFinish(
  attemptId: string,
  account: ExplorerAccount,
  options: {
    won?: boolean;
    championId?: string;
    items?: string[];
    runeIds?: string[];
    augmentIds?: string[];
    ledger?: boolean;
    damage?: number;
    healing?: number;
  } = {},
) {
  const id = randomUUID();
  const champion = options.championId ?? 'Garen';
  const items = options.items ?? [];
  const damage = options.damage ?? 120;
  const healing = options.healing ?? 40;
  const ledger =
    options.ledger === false
      ? { version: 2, champions: {}, items: [] }
      : {
          version: 2,
          champions: {
            [champion]: { damage_dealt: damage, healing_done: healing },
          },
          items: items.map((item, index) => ({
            sequence: index + 1,
            action: 'equipped',
            champion_id: champion,
            item_id: item,
          })),
        };
  const json = (value: unknown) => `'${JSON.stringify(value).split("'").join("''")}'::jsonb`;
  const array = (value: string[]) => `ARRAY(SELECT jsonb_array_elements_text(${json(value)}))`;
  return {
    id,
    sql: `INSERT INTO public.runs(id,player_id,run_uuid,won,waves_completed,run_level,progression_version,progression_source,run_attempt_id,progression_payload_hash,created_at,started_at,completed_at,ledger_version,run_ledger,rune_ids,augment_ids)
    VALUES('${id}','${account.playerId}','balance_${id}',${options.won ?? true},3,2,3,'verified','${attemptId}',repeat('e',64),'2024-02-01T12:30:00Z','2024-02-01T12:00:00Z','2024-02-01T12:30:00Z',2,${json(ledger)},${array(options.runeIds ?? [])},${array(options.augmentIds ?? [])});
    UPDATE public.run_attempts SET status='verified',expired_at=NULL,finish_command_id=gen_random_uuid(),finished_at='2024-02-01T12:30:00Z',verified_at='2024-02-01T12:30:00Z',result_run_id='${id}',result_hash=repeat('e',64),result='{}',response='{}' WHERE id='${attemptId}';
    INSERT INTO public.run_team_members(run_id,champion_id,final_hp,survived,damage_dealt,healing_done,items_collected)
    VALUES('${id}','${champion}',100,TRUE,${damage},${healing},${array(items)});`,
  };
}
