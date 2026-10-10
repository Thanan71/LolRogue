import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const describeDatabase = process.env.SUPABASE_DB_URL ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !process.env.SUPABASE_DB_URL) {
  throw new Error('SUPABASE_DB_URL is required for the technical SLO database contract');
}
const report = readFileSync(new URL('../scripts/sql/technical-slo.sql', import.meta.url), 'utf8');

describeDatabase('operator technical SLO report', () => {
  it('includes expired/backlogged seals in the denominator and preserves no-data', () => {
    const sql = `
      BEGIN;
      EXPLAIN ${report}
      CREATE TEMP TABLE technical_slo_fixture (
        engine_version TEXT, gameplay_ruleset_version INT, status TEXT,
        started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, verified_at TIMESTAMPTZ,
        rejected_at TIMESTAMPTZ, rejection_code TEXT
      );
      INSERT INTO technical_slo_fixture VALUES
        ('run-engine-v21',21,'verified', NOW()-INTERVAL '1 hour',NOW()-INTERVAL '10 minutes',NOW()-INTERVAL '9 minutes',NULL,NULL),
        ('run-engine-v21',21,'rejected', NOW()-INTERVAL '1 hour',NOW()-INTERVAL '10 minutes',NULL,NOW()-INTERVAL '9 minutes','invalid_trace'),
        ('run-engine-v21',21,'expired', NOW()-INTERVAL '1 hour',NOW()-INTERVAL '10 minutes',NULL,NULL,NULL),
        ('run-engine-v21',21,'finished', NOW()-INTERVAL '1 hour',NOW()-INTERVAL '10 minutes',NULL,NULL,NULL),
        ('run-engine-v21',21,'finished', NOW()-INTERVAL '1 hour',NOW()-INTERVAL '1 minute',NULL,NULL,NULL),
        ('run-engine-v20',20,'started', NOW()-INTERVAL '1 hour',NULL,NULL,NULL,NULL),
        ('run-engine-v19',19,'verified', NOW()-INTERVAL '31 days',NOW()-INTERVAL '10 minutes',NOW()-INTERVAL '9 minutes',NULL,NULL),
        ('run-engine-v18',18,'verifying', NOW()-INTERVAL '32 days',NOW()-INTERVAL '31 days',NULL,NULL,NULL);
      CREATE TEMP TABLE technical_slo_report AS ${report.replace('public.run_attempts', 'technical_slo_fixture')}
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM technical_slo_report WHERE engine_version='run-engine-v21'
          AND started_count=5 AND verified_count=1 AND rejected_count=1 AND expired_count=1 AND pending_count=2
          AND eligible_seals=4 AND within_slo=2 AND seal_to_terminal_sli=0.5
          AND seal_slo_alert AND backlog_alert AND overdue_pending_count=1
          AND verified_rate=0.2 AND rejected_rate=0.2 AND expired_rate=0.2
          AND start_to_verified_p95_seconds=3060 AND rejection_codes='{"invalid_trace":1}'::JSONB)
          THEN RAISE EXCEPTION 'SLO denominator, cohort, latency or code regression'; END IF;
        IF NOT EXISTS (SELECT FROM technical_slo_report WHERE engine_version='run-engine-v20'
          AND eligible_seals=0 AND seal_to_terminal_sli IS NULL AND seal_slo_alert IS NULL)
          THEN RAISE EXCEPTION 'No sealed samples must be unknown'; END IF;
        IF NOT EXISTS (SELECT FROM technical_slo_report WHERE engine_version='run-engine-v19'
          AND started_count=0 AND eligible_seals=1 AND within_slo=1
          AND seal_to_terminal_sli=1 AND NOT seal_slo_alert
          AND verified_rate IS NULL AND start_to_verified_p95_seconds IS NULL)
          THEN RAISE EXCEPTION 'Recent seals must survive an older start cohort'; END IF;
        IF NOT EXISTS (SELECT FROM technical_slo_report WHERE engine_version='run-engine-v18'
          AND started_count=0 AND eligible_seals=0 AND seal_to_terminal_sli IS NULL
          AND overdue_pending_count=1 AND backlog_alert)
          THEN RAISE EXCEPTION 'Unresolved backlog must survive the reporting window'; END IF;
      END $$;
      TRUNCATE technical_slo_fixture;
      CREATE TEMP TABLE empty_report AS ${report.replace('public.run_attempts', 'technical_slo_fixture')}
      DO $$ BEGIN
        IF EXISTS (SELECT FROM empty_report) THEN RAISE EXCEPTION 'Empty cohort invented traffic'; END IF;
      END $$;
      ROLLBACK;
    `;
    const args = ['--no-psqlrc', '--quiet', '--set', 'ON_ERROR_STOP=1'];
    const result = spawnSync('psql', [process.env.SUPABASE_DB_URL!, ...args], {
      encoding: 'utf8',
      input: sql,
    });
    if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
  });
});
