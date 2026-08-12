import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, 'src');
const policy = JSON.parse(await readFile(resolve(root, 'config/csp-inline-styles.json'), 'utf8'));

async function findSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return findSourceFiles(path);
      return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function readBalancedExpression(source, openingBrace) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace + 1, index);
    }
  }
  throw new Error(`Unclosed JSX expression at line ${lineAt(source, openingBrace)}.`);
}

function inspectStyleBindings(file, source, violations) {
  const bindings = [];
  const stylePattern = /\bstyle\s*=\s*\{/g;
  for (const match of source.matchAll(stylePattern)) {
    const expression = readBalancedExpression(source, match.index + match[0].lastIndexOf('{'));
    const properties = [...expression.matchAll(/(?:^|[,{]\s*)['"]([^'"]+)['"]\s*:/g)].map(
      (property) => property[1],
    );
    if (properties.length === 0 || expression.includes('...')) {
      violations.push(
        `${file}:${lineAt(source, match.index)} style must be a literal list of custom properties.`,
      );
    }
    for (const property of properties) {
      if (!property.startsWith('--')) {
        violations.push(
          `${file}:${lineAt(source, match.index)} inline style property ${property} is forbidden.`,
        );
      }
    }
    bindings.push({ file, properties: properties.sort() });
  }
  return bindings;
}

const bindings = [];
const violations = [];
const directMutationPattern =
  /\.style\b|\.cssText\b|\[['"](?:style|cssText)['"]\]|setAttribute\(\s*['"]style['"]/g;

for (const absolutePath of await findSourceFiles(sourceRoot)) {
  const file = relative(root, absolutePath).replaceAll('\\', '/');
  const source = await readFile(absolutePath, 'utf8');
  bindings.push(...inspectStyleBindings(file, source, violations));
  for (const match of source.matchAll(directMutationPattern)) {
    violations.push(
      `${file}:${lineAt(source, match.index)} direct DOM style mutation is forbidden.`,
    );
  }
}

const signature = ({ file, properties }) => `${file}:${[...properties].sort().join(',')}`;
const actual = bindings.map(signature).sort();
const expected = (policy.allowedBindings ?? []).map(signature).sort();

if (policy.schemaVersion !== 1) violations.push('Unsupported CSP inline-style policy version.');
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  violations.push(
    `dynamic style bindings differ from policy.\nExpected: ${expected.join('\n')}\nActual: ${actual.join('\n')}`,
  );
}

if (violations.length > 0) {
  throw new Error(`CSP inline-style policy failed:\n- ${violations.join('\n- ')}`);
}

console.log(
  `CSP inline-style policy passed: ${bindings.length} dynamic bindings, custom properties only, no DOM style mutation.`,
);
