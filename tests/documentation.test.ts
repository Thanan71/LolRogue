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

  it('référence les documents durables et clôt le bloc Documentation', () => {
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

    const documentationBlock = todo
      .split('### Documentation')[1]
      ?.split('## Ordre de réalisation recommandé')[0];
    expect(documentationBlock).toBeDefined();
    expect(documentationBlock).not.toContain('- [ ]');
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
});
