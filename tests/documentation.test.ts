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
    expect(gameplay).toContain('1 000 × vagues terminées');
    expect(gameplay).toContain('250 × biomes visités');
    expect(gameplay).toContain("Le score n'utilise ni l'or gagné/restant ni le nombre d'objets");
    expect(persistence).toContain('Dans le ruleset Daily v17 actif');
  });
});
