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
      'docs/gameplay.md',
      'docs/content-balance.md',
      'docs/progression-personalization.md',
      'docs/social-leaderboard.md',
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
    expect(todo).toContain('## Ordre de réalisation recommandé');
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
      'Classement compromis',
      'Secret exposé',
      'Sauvegarde absente ou restauration échouée',
    ]) {
      expect(incidents).toContain(incident);
    }

    expect(backup).toContain('RPO 24 h');
    expect(backup).toContain('RTO 4 h');
    expect(backup).toContain('Test de restauration isolé');
    expect(backup).toContain('SHA256SUMS');
    expect(backup).toContain('run_attempt_commands');

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
    const todoNext = read('TODO-NEXT.md');

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

    expect(todoNext).toContain('docs/archive/delivery-history-2026-07-august.md');
    expect(todoNext).not.toContain('Validation locale : `npm run check` avec **820 tests**');
  });

  it('documente la formule Daily réellement exécutée et sa version active', () => {
    const gameplay = read('docs/gameplay.md');
    const persistence = read('docs/data-and-persistence.md');
    const dailySql = read('supabase/migrations/20260726090000_authoritative_daily_leaderboard.sql');
    const v13Sql = read(
      'supabase/migrations/20260808120000_gameplay_ruleset_v13_content_balance.sql',
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
    expect(v13Sql).toContain("'2026-08-authoritative-daily-v13'");
    expect(v13Sql).toContain('score_version');
    expect(v13Sql).toContain("'lolrogue.daily.v13'");
    expect(gameplay).toContain('1 000 × vagues terminées');
    expect(gameplay).toContain('250 × biomes visités');
    expect(gameplay).toContain("Le score n'utilise ni l'or restant ni le nombre d'objets");
    expect(persistence).toContain('Dans le ruleset Daily v13 actif');
  });
});
