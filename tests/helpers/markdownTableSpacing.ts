interface TableRow {
  cells: string[];
  indent: string;
  trailing: string;
}

const trimPadding = (value: string): string => value.replace(/^[ \t]+|[ \t]+$/g, '');

function readTableRow(line: string): TableRow | null {
  const content = line.replace(/[ \t]+$/, '');
  const opening = /^( {0,3})\|/.exec(content);
  if (!opening) return null;
  const cells: string[] = [];
  let start = opening[0].length;
  for (let index = start; index < content.length; index += 1) {
    if (content[index] === '\\') {
      index += 1;
    } else if (content[index] === '|') {
      cells.push(content.slice(start, index));
      start = index + 1;
    }
  }
  if (start !== content.length || cells.length < 2) return null;
  return { cells, indent: opening[1], trailing: line.slice(content.length) };
}

/** Keep document assertions independent of padding in pipe-delimited Markdown tables. */
export function normalizeMarkdownTableSpacing(source: string): string {
  let fence: { marker: string; width: number } | undefined;
  let columns = 0;
  return source
    .split('\n')
    .map((line, index, lines) => {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (
          marker?.[1][0] === fence.marker &&
          marker[1].length >= fence.width &&
          marker[2].trim() === ''
        ) {
          fence = undefined;
        }
        return line;
      }
      if (marker) {
        fence = { marker: marker[1][0], width: marker[1].length };
        columns = 0;
        return line;
      }
      const row = readTableRow(line);
      if (!row || row.cells.length !== columns) {
        columns = 0;
        const delimiter = readTableRow(lines[index + 1] ?? '');
        if (
          row &&
          delimiter?.cells.length === row.cells.length &&
          delimiter.cells.every((cell) => /^:?-{3,}:?$/.test(trimPadding(cell)))
        ) {
          columns = row.cells.length;
        }
      }
      return row && columns
        ? `${row.indent}| ${row.cells.map(trimPadding).join(' | ')} |${row.trailing}`
        : line;
    })
    .join('\n');
}
