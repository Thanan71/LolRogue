import { readFileSync } from 'node:fs';
import {
  LOCAL_STORAGE_PURPOSES,
  PRIVACY_RETENTION,
  PRODUCTION_LEGAL_GATE,
  RIOT_FAN_PROJECT_NOTICE,
} from '@/legal/legalContract';

const migration = readFileSync(
  new URL('../supabase/migrations/20260808180000_legal_privacy_retention.sql', import.meta.url),
  'utf8',
);
const socialRetentionMigration = readFileSync(
  new URL('../supabase/migrations/20260809180000_automate_social_retention.sql', import.meta.url),
  'utf8',
);

describe('legal and privacy contract', () => {
  it('keeps monetization and public legal clearance closed', () => {
    expect(PRODUCTION_LEGAL_GATE).toMatchObject({
      targetRegion: 'France et Union européenne',
      monetizationAllowed: false,
      publicReleaseCleared: false,
      requiresExternalCounsel: true,
      requiresRiotClearanceAssessment: true,
    });
    expect(RIOT_FAN_PROJECT_NOTICE).toContain('Riot Games ne soutient ni ne sponsorise');
  });

  it('declares only functional local storage purposes', () => {
    expect(LOCAL_STORAGE_PURPOSES).toHaveLength(4);
    expect(LOCAL_STORAGE_PURPOSES.join(' ')).not.toMatch(/publicit|marketing|tracking/i);
  });

  it('enforces the public Daily and reviewed-report retention periods', () => {
    expect(PRIVACY_RETENTION.publicDailyLeaderboardMonths).toBe(13);
    expect(PRIVACY_RETENTION.reviewedModerationReportMonths).toBe(24);
    expect(migration).toContain("daily.completed_at >= NOW() - INTERVAL '13 months'");
    expect(migration).toContain("reviewed_at < NOW() - INTERVAL '24 months'");
    expect(migration).toContain('CREATE FUNCTION public.purge_expired_social_data()');
    expect(migration).toContain("(SELECT auth.role()) <> 'service_role'");
  });

  it('schedules the reviewed social-data purge every month', () => {
    expect(socialRetentionMigration).toContain("'lolrogue-purge-expired-social-data'");
    expect(socialRetentionMigration).toContain("'43 4 1 * *'");
    expect(socialRetentionMigration).toContain('SELECT private.purge_expired_social_data()');
  });

  it('runs scheduled retention outside every web role', () => {
    expect(socialRetentionMigration).toContain(
      'REVOKE ALL ON FUNCTION private.purge_expired_social_data()',
    );
    expect(socialRetentionMigration).toContain('FROM PUBLIC, anon, authenticated, service_role');
    expect(socialRetentionMigration).toContain("(SELECT auth.role()) <> 'service_role'");
    expect(socialRetentionMigration).toContain('TO service_role');
  });
});
