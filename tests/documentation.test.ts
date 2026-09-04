import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('documentation maintenue', () => {
  it('conserve des liens locaux valides dans le README', () => {
    const readmePath = resolve(root, 'README.md');
    const readme = readFileSync(readmePath, 'utf8');
    const links = [...readme.matchAll(/\[[^\]]+\]\((?!https?:|#)([^)]+)\)/g)].map(
      (match) => match[1],
    );

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const path = link.split('#')[0];
      expect(existsSync(resolve(dirname(readmePath), path)), `Lien README cassé : ${link}`).toBe(
        true,
      );
    }
  });

  it('référence les documents durables et expose un backlog auditable', () => {
    const readme = read('README.md');
    const todo = read('TODO.md');

    for (const path of [
      'docs/data-and-persistence.md',
      'docs/product-decisions.md',
      'docs/beta-readiness.md',
      'docs/gameplay.md',
      'docs/content-balance.md',
      'docs/progression-personalization.md',
      'docs/social-leaderboard.md',
      'docs/legal-and-privacy.md',
      'docs/administration.md',
      'docs/operations.md',
      'docs/incident-runbooks.md',
      'docs/backup-and-restore.md',
      'docs/release-and-support.md',
      'docs/roadmap.md',
    ]) {
      expect(readme).toContain(path);
      expect(existsSync(resolve(root, path))).toBe(true);
    }

    expect(todo).toContain('### Définition de Done');
    expect(todo).toContain('## P0');
    expect(todo).toContain('## P1');
    expect(todo).toContain('## P2');
    expect(todo).toContain("# 2. Ordre d'exécution recommandé");
    expect(todo).toContain('- [ ]');
  });

  it("maintient un contrat d'exploitation utilisable sans connaissance orale", () => {
    const operations = read('docs/operations.md');
    const incidents = read('docs/incident-runbooks.md');
    const backup = read('docs/backup-and-restore.md');
    const release = read('docs/release-and-support.md');

    for (const path of [
      'docs/incident-runbooks.md',
      'docs/backup-and-restore.md',
      'docs/release-and-support.md',
      'docs/administration.md',
    ]) {
      expect(operations).toContain(path);
      expect(existsSync(resolve(root, path))).toBe(true);
    }

    for (const incident of [
      'Migration échouée',
      'Rollback applicatif',
      'Indisponibilité Supabase',
      'Rejets authority anormaux',
      'Classement compromis',
      'Secret exposé',
      'Sauvegarde absente ou restauration échouée',
    ]) {
      expect(incidents).toContain(incident);
    }

    expect(operations).toContain('SLO de vérification authority');
    expect(operations).toContain('99 % sur une fenêtre glissante de 30 jours');
    expect(operations).toContain('120 secondes');
    expect(operations).toContain('fenêtre glissante de **15 minutes**');
    expect(incidents).toContain('Ne jamais y copier commandes, payload, journal');

    expect(backup).toContain('RPO 24 h');
    expect(backup).toContain('RTO 4 h');
    expect(backup).toContain('Test de restauration isolé');
    expect(backup).toContain('SHA256SUMS');
    expect(backup).toContain('run_attempt_commands');
    expect(backup).toContain('npm run ops:restore-drill');

    const restoreEvidence = JSON.parse(read('docs/restore-drills/2026-08-12-local.json'));
    expect(restoreEvidence).toMatchObject({
      schemaVersion: 1,
      drill: 'P2-OPS-01',
      scope: 'local-isolated',
      objectives: { rpo: '24h', rto: '4h' },
      checks: {
        auth: true,
        cron: true,
        function: true,
        rls: true,
        storage: true,
        verifyRunIncident: { pendingAttemptPreserved: true, result: 'passed' },
        leaderboardIncident: { projectionRebuilt: true, result: 'passed' },
      },
      result: 'passed',
    });
    expect(restoreEvidence.measured.rpoMs).toBeLessThanOrEqual(24 * 60 * 60 * 1_000);
    expect(restoreEvidence.measured.rtoMs).toBeLessThanOrEqual(4 * 60 * 60 * 1_000);
    expect(restoreEvidence.operator).toBeTruthy();

    for (const contract of [
      'Development',
      'Preview',
      'Production',
      'Checklist de release',
      'Smoke test production',
      'Export de compte',
      'Suppression de compte',
    ]) {
      expect(release).toContain(contract);
    }
  });

  it('fait dériver la readiness de preuves objectives plutôt que du TODO historique', () => {
    const readiness = read('docs/beta-readiness.md');
    const todo = read('TODO.md');
    const releaseSheet = JSON.parse(read('config/beta-release.json'));

    expect(readiness).toContain('<!-- release-readiness:status=blocked -->');
    expect(readiness).toContain('**Statut objectif : BLOQUÉ.**');
    expect(readiness).toContain('Trois CI complètes post-P0');
    expect(readiness).toContain('version exacte de la dernière migration');
    expect(readiness).not.toContain('Les dix critères techniques sont donc **démontrés**');
    expect(releaseSheet.declaredStatus).toBe('blocked');
    expect(releaseSheet.candidate).toEqual({
      sha: null,
      previewUrl: null,
      liveDatabase: {
        latestMigrationVersion: null,
        migrationVersions: [],
        checkedAt: null,
      },
    });
    expect(todo).toContain("## P0-REL-01 — Réparer la gate bêta pour qu'elle reflète l'état réel");
    expect(todo).toContain('Passer immédiatement le statut bêta à **bloqué**');
    expect(todo).toContain('Exiger trois CI **postérieures au dernier correctif P0**');
  });

  it('ne réintroduit pas les guides historiques ponctuels', () => {
    for (const path of [
      'ADMIN_SETUP_GUIDE.md',
      'DB_LOGGER_FIX.md',
      'ENHANCED_RUN_TRACKING.md',
      'ENHANCEMENT_SYSTEM_COMPLETE.md',
      'SOLID_IMPROVEMENTS.md',
      'src/utils/README_DB_LOGGER.md',
    ]) {
      expect(existsSync(resolve(root, path))).toBe(false);
    }
  });

  it('relie le statut produit à des preuves existantes sans recycler les constats initiaux', () => {
    const matrix = read('docs/feature-status.md');
    const todo = read('TODO.md');

    expect(matrix).toContain('Fonctionnalité | Implémentation de référence | Preuves principales');
    expect(matrix).toContain('aucune alerte haute/critique au 8 août 2026');
    for (const proof of [
      'authorityRunEngine.test.ts',
      'six-biome-run.spec.ts',
      'authoritativeDaily.database.test.ts',
      'production-matrix.spec.ts',
    ]) {
      const location = proof.endsWith('.spec.ts') ? `e2e/${proof}` : `tests/${proof}`;
      expect(existsSync(resolve(root, location)), `Preuve absente : ${location}`).toBe(true);
      expect(matrix).toContain(proof);
    }

    expect(todo).toContain('docs/feature-status.md');
    expect(existsSync(resolve(root, 'docs/archive/delivery-history-2026-07-august.md'))).toBe(true);
    expect(existsSync(resolve(root, 'TODO-NEXT.md'))).toBe(false);
    expect(todo).not.toContain('Validation locale : `npm run check` avec **820 tests**');
  });

  it("distingue l'analyse des catalogues des vraies runs d'équilibrage", () => {
    const balance = read('docs/content-balance.md');
    const matrix = read('docs/feature-status.md');

    expect(balance).toContain('`analyzeContentCatalog()`');
    expect(balance).toContain("un seed de carte analysé n'est donc pas une run");
    expect(balance).toContain(
      'Les vraies runs automatisées passent par `simulateAuthorityCohort()`',
    );
    expect(balance).toContain('restent des hypothèses');
    expect(balance).toMatch(
      /Cette analyse statique ne produit pas la\s+baseline authority de calibration/,
    );
    expect(balance).toMatch(/cohortes\s+authority versionnées/);
    expect(balance).not.toContain('100 runs complètes');
    expect(balance).not.toContain('30 runs scriptées');
    expect(balance).not.toContain('playtest automatisé reproductible');

    expect(matrix).toContain('contentCatalogAnalysis.test.ts');
    expect(matrix).toContain('simulateAuthorityCohort');
    expect(matrix).not.toContain('balanceSimulation.test.ts');
    expect(matrix).not.toContain('Baseline v15');
    expect(existsSync(resolve(root, 'tests/contentCatalogAnalysis.test.ts'))).toBe(true);
  });

  it('documente la formule Daily réellement exécutée et sa version active', () => {
    const gameplay = read('docs/gameplay.md');
    const persistence = read('docs/data-and-persistence.md');
    const dailySql = read('supabase/migrations/20260726090000_authoritative_daily_leaderboard.sql');
    const v16Sql = read('supabase/migrations/20260823073234_gameplay_ruleset_v16_daily_parity.sql');
    const v17Sql = read(
      'supabase/migrations/20260823081828_gameplay_ruleset_v17_economy_balance.sql',
    );
    const v18Sql = read('supabase/migrations/20260828150025_gameplay_ruleset_v18_early_top.sql');
    const v19Sql = read(
      'supabase/migrations/20260830093859_gameplay_ruleset_v19_combat_balance.sql',
    );
    const v20Sql = read('supabase/migrations/20260831152608_gameplay_ruleset_v20_map_economy.sql');
    const v21Sql = read(
      'supabase/migrations/20260904151818_gameplay_ruleset_v21_balance_acceptance.sql',
    );

    for (const token of [
      'v_ruleset.victory_bonus',
      'v_ruleset.wave_points',
      'v_ruleset.biome_points',
      'v_ruleset.run_level_points',
      'v_ruleset.gold_points',
    ]) {
      expect(dailySql).toContain(token);
    }
    expect(v16Sql).toContain("'2026-08-progression-neutral-daily-v16'");
    expect(v16Sql).toContain('score_version');
    expect(v16Sql).toContain("'lolrogue.daily.v16'");
    expect(v17Sql).toContain("'2026-08-economy-balance-daily-v17'");
    expect(v17Sql).toContain("'lolrogue.daily.v17'");
    expect(v17Sql).toContain('gold_points = 0');
    expect(v18Sql).toContain("'2026-08-early-top-daily-v18'");
    expect(v18Sql).toContain("'lolrogue.daily.v18'");
    expect(v18Sql).toContain('AND gold_points = 0');
    expect(v19Sql).toContain("'2026-08-combat-balance-daily-v19'");
    expect(v19Sql).toContain("'lolrogue.daily.v19'");
    expect(v19Sql).toContain('AND gold_points = 0');
    expect(v20Sql).toContain("'2026-08-map-economy-daily-v20'");
    expect(v20Sql).toContain("'lolrogue.daily.v20'");
    expect(v20Sql).toContain('AND score_version = 15');
    expect(v20Sql).toContain('AND gold_points = 0');
    expect(v20Sql).toContain(
      'UPDATE public.daily_challenge_rulesets SET is_active = TRUE WHERE version = 20',
    );
    expect(v20Sql).toContain("'2026-08-participation-rewards-v3'");
    expect(v20Sql).toContain("p_result -> 'ledger' ->> 'version' <> '2'");
    expect(v21Sql).toContain("'2026-09-balance-acceptance-daily-v21'");
    expect(v21Sql).toContain("'lolrogue.daily.v21'");
    expect(v21Sql).toContain('AND score_version = 15');
    expect(v21Sql).toContain('AND gold_points = 0');
    expect(v21Sql).toContain(
      'UPDATE public.daily_challenge_rulesets SET is_active = TRUE WHERE version = 21',
    );
    expect(gameplay).toContain('1 000 × vagues terminées');
    expect(gameplay).toContain('250 × biomes visités');
    expect(gameplay).toContain("Le score n'utilise ni l'or gagné/restant ni le nombre d'objets");
    expect(gameplay).toContain('Pour le ruleset actif v21');
    expect(persistence).toContain('Dans le ruleset Daily v21 actif');
  });

  it('documente les preuves v20 historiques et la fermeture automatisée v21', () => {
    const todo = read('TODO.md');
    const authority = read('docs/authority-versioning.md');
    const balance = read('docs/content-balance.md');
    const gameplay = read('docs/gameplay.md');
    const persistence = read('docs/data-and-persistence.md');
    const testing = read('docs/testing.md');
    const matrix = read('docs/feature-status.md');

    expect(todo).toContain('11. [x] `P1-BAL-02`');
    expect(todo).toContain('7. [x] `P0-BAL-02`');
    expect(todo).toContain('1 170 métriques de non-régression');
    expect(todo).toContain('borne Wilson basse');
    expect(todo).toContain("revue de PR ; l'automatisation");
    expect(todo).toContain('`≤ 5×`');
    expect(authority).toContain('836 449 octets');
    expect(authority).toContain('55df03729dc47417db3efb28ba534cbbf830f9cd3c771e4fdcda8d33eb9996eb');
    expect(authority).toContain(
      '8308ebe66c3ee45850b68560b0449b6660b24c2a0e81a5070f6d1794620cac91',
    );
    for (const document of [authority, balance, persistence]) {
      expect(document).toContain(
        'c0b776b628006a779a618fb2abfa00a3ff99fd27d27980dfdec54378fc4d81a3',
      );
    }
    expect(balance).toContain('sept baselines authority v15 à v21');
    expect(balance).toContain('analyse 1 000 seeds');
    expect(balance).toContain('rejoue 1 200 runs');
    expect(balance).toContain('v20 au moteur v21');
    expect(gameplay).toContain('1,0, 1,1, 1,2, 1,25, 1,4 et 1,6');
    expect(persistence).toContain('ledger v2');
    expect(testing).toContain('gates automatisées P0-BAL-02');
    expect(matrix).toContain('seuls les playtests humains restent ouverts');
  });
});
