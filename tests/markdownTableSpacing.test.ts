// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeMarkdownTableSpacing } from './helpers/markdownTableSpacing';

const statusContract = 'Playtests humains | **bloqué / non réalisé**';
const columnsContract = 'Fonctionnalité | Implémentation de référence | Preuves principales';
const statusTable = [
  '| Source | État |',
  '| --- | --- |',
  '| Playtests humains | **bloqué / non réalisé** |',
].join('\n');
const columnsTable = [
  '| Fonctionnalité | Implémentation de référence | Preuves principales |',
  '| --- | --- | --- |',
  '| Combat | Moteur | Contrôle existant |',
].join('\n');

describe('Markdown table contract spacing', () => {
  it.each([false, true])('accepts the same contracts with padded=%s', (padded) => {
    const source = `${statusTable}\n\n${columnsTable}`;
    const input = padded ? source.replace(/ \|/g, '       |').replace(/\| /g, '|\t ') : source;
    const normalized = normalizeMarkdownTableSpacing(input);
    expect(normalized).toContain(statusContract);
    expect(normalized).toContain(columnsContract);
  });

  it.each([
    ['changed status', statusTable.replace('bloqué / non réalisé', 'réalisé'), statusContract],
    ['removed status', statusTable.split('\n').slice(0, 2).join('\n'), statusContract],
    ['changed heading', columnsTable.replace('Fonctionnalité', 'Autre titre'), columnsContract],
    [
      'reordered columns',
      columnsTable.replace(
        'Fonctionnalité | Implémentation de référence',
        'Implémentation de référence | Fonctionnalité',
      ),
      columnsContract,
    ],
  ])('rejects the original contract after %s', (_name, source, contract) => {
    expect(normalizeMarkdownTableSpacing(source)).not.toContain(contract);
  });

  it('preserves escaped pipes and whitespace inside cells', () => {
    const source = '| Colonne | Valeur |\n| --- | --- |\n| gauche\\|   droite    | `a  b` |';
    const normalized = normalizeMarkdownTableSpacing(source);
    expect(normalized).toContain('gauche\\|   droite | `a  b`');
    expect(normalized).toContain('gauche\\|   droite');
  });

  it('keeps prose, standalone pipe rows and indented or fenced code byte-identical', () => {
    const source = [
      'Prose  avec |   espaces.',
      '| Ligne isolée    |   texte |',
      '',
      ...statusTable.split('\n').map((line) => `    ${line}`),
      '',
      '```markdown',
      statusTable,
      '```',
      '',
      '~~~markdown',
      columnsTable,
      '~~~',
    ].join('\n');
    expect(normalizeMarkdownTableSpacing(source)).toBe(source);
  });
});
