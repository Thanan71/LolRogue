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
      'docs/administration.md',
      'docs/operations.md',
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
    const v12Sql = read(
      'supabase/migrations/20260801090000_gameplay_ruleset_v12_canonical_stats.sql',
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
    expect(v12Sql).toContain("'2026-08-authoritative-daily-v12'");
    expect(v12Sql).toContain('score_version = 12');
    expect(gameplay).toContain('1 000 × vagues terminées');
    expect(gameplay).toContain('250 × biomes visités');
    expect(gameplay).toContain("Le score n'utilise ni l'or restant ni le nombre d'objets");
    expect(persistence).toContain('Dans le ruleset Daily v12 actif');
  });
});
