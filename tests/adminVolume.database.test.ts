import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cleanupExplorer,
  type ExplorerAccount,
  explorerAccount,
  explorerClient,
  explorerSql,
  hasAdminExplorerCredentials,
} from './helpers/adminExplorerFixtures';

const describeDatabase = hasAdminExplorerCredentials ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !hasAdminExplorerCredentials) {
  throw new Error('Admin volume tests require disposable loopback API and SQL credentials.');
}

describeDatabase('admin exact populations at pagination boundaries', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let admin: ExplorerAccount;
  const prefix = `s7_volume_${randomUUID().replace(/-/g, '')}`;

  beforeAll(async () => {
    service = explorerClient('service');
    admin = await explorerAccount(service, users, { admin: true });
  });
  afterAll(async () => cleanupExplorer(service, users));

  it.each([0, 100, 101, 1000, 1001])(
    'returns all %i players once and the matching global metric across every page',
    (count) => {
      // Every case rolls back, including Auth-triggered profiles. Equal timestamps
      // exercise the UUID tie-breaker independently from the visible page limit.
      const output = explorerSql(`BEGIN;
        CREATE TEMP TABLE volume_before AS SELECT count(*) AS n FROM public.players;
        GRANT SELECT ON volume_before TO authenticated;
        INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        SELECT ('a7000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
          'authenticated','authenticated','${prefix}_'||n||'@example.test','{}',
          jsonb_build_object('username','${prefix}_'||n),NOW(),NOW()
        FROM generate_series(1,${count}) n;
        SELECT set_config('request.jwt.claims',
          '{"sub":"${admin.userId}","role":"authenticated"}',TRUE);
        SET LOCAL ROLE authenticated;
        WITH RECURSIVE pages(page_index,body) AS (
          SELECT 0, public.admin_search_players(jsonb_build_object('search','${prefix}'),NULL,NULL,100)
          UNION ALL
          SELECT page_index+1,public.admin_search_players(jsonb_build_object('search','${prefix}'),
            body->'nextCursor',(body->>'snapshotAt')::timestamptz,100)
          FROM pages WHERE (body->>'hasMore')::boolean AND page_index<20
        ), listed AS (
          SELECT page_index,ordinality,item->>'id' AS id
          FROM pages CROSS JOIN LATERAL jsonb_array_elements(body->'items') WITH ORDINALITY AS entry(item,ordinality)
        )
        SELECT jsonb_build_object(
          'totals',(SELECT jsonb_agg(body->'total' ORDER BY page_index) FROM pages),
          'pageSizes',(SELECT jsonb_agg(jsonb_array_length(body->'items') ORDER BY page_index) FROM pages),
          'hasMore',(SELECT jsonb_agg(body->'hasMore' ORDER BY page_index) FROM pages),
          'ids',(SELECT coalesce(jsonb_agg(id ORDER BY page_index,ordinality),'[]') FROM listed),
          'expectedIds',(SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]') FROM public.players WHERE left(username,length('${prefix}'))='${prefix}'),
          'lastCursor',(SELECT body->'nextCursor' FROM pages ORDER BY page_index DESC LIMIT 1),
          'snapshots',(SELECT count(DISTINCT body->>'snapshotAt') FROM pages),
          'metricDelta',(SELECT stat_value::bigint-(SELECT n FROM volume_before) FROM public.admin_stats WHERE stat_name='total_players')
        );
        ROLLBACK;`);
      const result = JSON.parse(
        output.split('\n').find((line) => line.startsWith('{') && line.includes('"metricDelta"'))!,
      ) as {
        totals: number[];
        pageSizes: number[];
        hasMore: boolean[];
        ids: string[];
        expectedIds: string[];
        lastCursor: unknown;
        snapshots: number;
        metricDelta: number;
      };
      const pages = Math.max(1, Math.ceil(count / 100));
      expect(result.totals).toEqual(Array(pages).fill(count));
      expect(result.pageSizes).toEqual(
        Array.from({ length: pages }, (_, index) => Math.min(100, count - index * 100)),
      );
      expect(result.hasMore).toEqual(
        Array.from({ length: pages }, (_, index) => index < pages - 1),
      );
      expect(result.ids).toHaveLength(count);
      expect(new Set(result.ids).size).toBe(count);
      expect([...result.ids].sort()).toEqual(result.expectedIds);
      expect(result.lastCursor).toBeNull();
      expect(result.snapshots).toBe(1);
      expect(result.metricDelta).toBe(count);
    },
    30_000,
  );
});
