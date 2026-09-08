import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript/unstable/ast';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { API } from 'typescript/unstable/sync';

const COPY_BEARING_NAMES = [
  'message',
  'label',
  'title',
  'subtitle',
  'description',
  'notice',
  'hint',
  'tooltip',
  'statusMessage',
] as const;

const USER_FACING_ATTRIBUTES = [
  'alt',
  'aria-braillelabel',
  'aria-brailleroledescription',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'caption',
  'label',
  'placeholder',
  'title',
  'tooltip',
] as const;

export const DEFAULT_INVARIANT_TOKENS = [
  'AD',
  'AP',
  'ARAM',
  'CS',
  'DPS',
  'HP',
  'KDA',
  'League of Legends',
  'LoL',
  'LP',
  'MR',
  'PvE',
  'PvP',
  'Q',
  'R',
  'Riot Games',
  'RNG',
  'RP',
  "Summoner's Rift",
  'W',
  'XP',
] as const;

export type UserCopyFindingKind =
  | 'copy-property'
  | 'copy-variable'
  | 'jsx-attribute'
  | 'jsx-expression'
  | 'jsx-text';

export interface UserCopyFinding {
  column: number;
  filePath: string;
  kind: UserCopyFindingKind;
  line: number;
  name?: string;
  text: string;
}

export interface UserCopyScannerOptions {
  additionalCopyBearingNames?: readonly string[];
  additionalInvariantTokens?: readonly string[];
  additionalUserFacingAttributes?: readonly string[];
  filePath?: string;
}

interface ScannerContext {
  copyBearingNames: ReadonlySet<string>;
  filePath: string;
  ignoredLiterals: ReadonlySet<string>;
  sourceFile: ts.SourceFile;
  userFacingAttributes: ReadonlySet<string>;
}

const ALPHABETIC_CHARACTER = /\p{L}/u;
const TECHNICAL_REFERENCE = /^(?:#|\/|\.\.?\/|[a-z][a-z\d+.-]*:\/\/)/iu;
const TECHNICAL_KEY = /^(?:[a-z\d]+(?:[._:/][a-z\d-]+)+|[A-Z\d]+(?:_[A-Z\d]+)+)$/u;

function normalizeName(value: string): string {
  return value.replace(/[-_\s]/gu, '').toLocaleLowerCase('en-US');
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function normalizeInvariant(value: string): string {
  return normalizeText(value).normalize('NFKC').toLocaleLowerCase('en-US');
}

function makeNameSet(defaults: readonly string[], additions: readonly string[] = []): Set<string> {
  return new Set([...defaults, ...additions].map(normalizeName));
}

function makeInvariantSet(additions: readonly string[] = []): Set<string> {
  return new Set([...DEFAULT_INVARIANT_TOKENS, ...additions].map(normalizeInvariant));
}

function isUserCopy(value: string, ignoredLiterals: ReadonlySet<string>): boolean {
  const normalized = normalizeText(value);
  if (!normalized || !ALPHABETIC_CHARACTER.test(normalized)) return false;
  if (ignoredLiterals.has(normalizeInvariant(normalized))) return false;
  if (TECHNICAL_REFERENCE.test(normalized) || TECHNICAL_KEY.test(normalized)) return false;
  return true;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertion(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function collectRenderedLiterals(
  expression: ts.Expression,
  collect: (value: string, node: ts.Node) => void,
): void {
  const current = unwrapExpression(expression);

  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    collect(current.text, current);
    return;
  }

  if (ts.isTemplateExpression(current)) {
    collect(current.head.text, current.head);
    for (const span of current.templateSpans) {
      collectRenderedLiterals(span.expression, collect);
      collect(span.literal.text, span.literal);
    }
    return;
  }

  if (ts.isConditionalExpression(current)) {
    collectRenderedLiterals(current.whenTrue, collect);
    collectRenderedLiterals(current.whenFalse, collect);
    return;
  }

  if (!ts.isBinaryExpression(current)) return;

  const operator = current.operatorToken.kind;
  if (
    operator === ts.SyntaxKind.PlusToken ||
    operator === ts.SyntaxKind.AmpersandAmpersandToken ||
    operator === ts.SyntaxKind.BarBarToken ||
    operator === ts.SyntaxKind.QuestionQuestionToken
  ) {
    collectRenderedLiterals(current.left, collect);
    collectRenderedLiterals(current.right, collect);
  }
}

function propertyNameText(name: ts.PropertyName | ts.BindingName | undefined): string | undefined {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    const expression = unwrapExpression(name.expression);
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }
  }
  return undefined;
}

function assignmentTargetName(
  expression: ts.Expression,
): { kind: 'copy-property' | 'copy-variable'; name: string } | undefined {
  const target = unwrapExpression(expression);
  if (ts.isIdentifier(target)) return { kind: 'copy-variable', name: target.text };
  if (ts.isPropertyAccessExpression(target)) {
    return { kind: 'copy-property', name: target.name.text };
  }
  if (ts.isElementAccessExpression(target) && target.argumentExpression) {
    const argument = unwrapExpression(target.argumentExpression);
    if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
      return { kind: 'copy-property', name: argument.text };
    }
  }
  return undefined;
}

function isInsideNonCopyElement(node: ts.Node): boolean {
  const parent = node.parent;
  if (!ts.isJsxElement(parent)) return false;
  const tagName = parent.openingElement.tagName.getText().toLocaleLowerCase('en-US');
  return tagName === 'script' || tagName === 'style';
}

function virtualSourceExtension(filePath: string): string {
  return filePath.match(/\.(?:[cm]?[jt]sx?)$/iu)?.[0] ?? '.tsx';
}

function withParsedSourceFile<T>(
  sourceText: string,
  filePath: string,
  inspect: (sourceFile: ts.SourceFile) => T,
): T {
  const virtualRoot = '/user-copy-scanner';
  const sourceName = `input${virtualSourceExtension(filePath)}`;
  const virtualSourcePath = `${virtualRoot}/${sourceName}`;
  const virtualConfigPath = `${virtualRoot}/tsconfig.json`;
  const fileSystem = createVirtualFileSystem({
    [virtualConfigPath]: JSON.stringify({
      compilerOptions: { allowJs: true, jsx: 'react-jsx', noLib: true },
      files: [sourceName],
    }),
    [virtualSourcePath]: sourceText,
  });
  const api = new API({ cwd: virtualRoot, fs: fileSystem });

  try {
    const snapshot = api.updateSnapshot({ openProjects: [virtualConfigPath] });
    try {
      const project = snapshot.getProject(virtualConfigPath) ?? snapshot.getProjects()[0];
      const sourceFile = project?.program.getSourceFile(virtualSourcePath);
      if (!sourceFile) throw new Error(`Unable to parse ${filePath} with the TypeScript AST API.`);
      return inspect(sourceFile);
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

export function scanUserCopySource(
  sourceText: string,
  options: UserCopyScannerOptions = {},
): UserCopyFinding[] {
  const filePath = options.filePath ?? 'inline.tsx';
  return withParsedSourceFile(sourceText, filePath, (sourceFile) => {
    const context: ScannerContext = {
      copyBearingNames: makeNameSet(COPY_BEARING_NAMES, options.additionalCopyBearingNames),
      filePath,
      ignoredLiterals: makeInvariantSet(options.additionalInvariantTokens),
      sourceFile,
      userFacingAttributes: makeNameSet(
        [...USER_FACING_ATTRIBUTES, ...COPY_BEARING_NAMES],
        options.additionalUserFacingAttributes,
      ),
    };
    const findings: UserCopyFinding[] = [];
    const findingKeys = new Set<string>();

    const report = (
      value: string,
      node: ts.Node,
      kind: UserCopyFindingKind,
      name?: string,
    ): void => {
      const text = normalizeText(value);
      if (!isUserCopy(text, context.ignoredLiterals)) return;

      const position = node.getStart(sourceFile);
      const key = `${position}:${kind}:${name ?? ''}:${text}`;
      if (findingKeys.has(key)) return;
      findingKeys.add(key);

      const location = sourceFile.getLineAndCharacterOfPosition(position);
      findings.push({
        column: location.character + 1,
        filePath: context.filePath,
        kind,
        line: location.line + 1,
        ...(name ? { name } : {}),
        text,
      });
    };

    const reportExpression = (
      expression: ts.Expression | undefined,
      kind: UserCopyFindingKind,
      name?: string,
    ): void => {
      if (!expression) return;
      collectRenderedLiterals(expression, (value, node) => report(value, node, kind, name));
    };

    const reportNamedInitializer = (
      name: string | undefined,
      initializer: ts.Expression | undefined,
      kind: 'copy-property' | 'copy-variable',
    ): void => {
      if (!name || !context.copyBearingNames.has(normalizeName(name))) return;
      reportExpression(initializer, kind, name);
    };

    const visit = (node: ts.Node): void => {
      if (ts.isJsxText(node) && !isInsideNonCopyElement(node)) {
        report(node.getText(sourceFile), node, 'jsx-text');
      } else if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(sourceFile);
        if (context.userFacingAttributes.has(normalizeName(name))) {
          if (node.initializer && ts.isStringLiteral(node.initializer)) {
            report(node.initializer.text, node.initializer, 'jsx-attribute', name);
          } else if (node.initializer && ts.isJsxExpression(node.initializer)) {
            reportExpression(node.initializer.expression, 'jsx-attribute', name);
          }
        }
      } else if (
        ts.isJsxExpression(node) &&
        !ts.isJsxAttribute(node.parent) &&
        !isInsideNonCopyElement(node)
      ) {
        reportExpression(node.expression, 'jsx-expression');
      } else if (ts.isPropertyAssignment(node)) {
        reportNamedInitializer(propertyNameText(node.name), node.initializer, 'copy-property');
      } else if (ts.isPropertyDeclaration(node)) {
        reportNamedInitializer(propertyNameText(node.name), node.initializer, 'copy-property');
      } else if (ts.isVariableDeclaration(node)) {
        reportNamedInitializer(propertyNameText(node.name), node.initializer, 'copy-variable');
      } else if (ts.isParameterDeclaration(node)) {
        reportNamedInitializer(propertyNameText(node.name), node.initializer, 'copy-variable');
      } else if (ts.isBindingElement(node)) {
        reportNamedInitializer(
          propertyNameText(node.propertyName ?? node.name),
          node.initializer,
          'copy-variable',
        );
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        const target = assignmentTargetName(node.left);
        if (target) reportNamedInitializer(target.name, node.right, target.kind);
      }

      node.forEachChild(visit);
    };

    visit(sourceFile);
    return findings;
  });
}

export function scanUserCopyFile(
  file: string | URL,
  options: Omit<UserCopyScannerOptions, 'filePath'> = {},
): UserCopyFinding[] {
  const filePath = typeof file === 'string' ? file : fileURLToPath(file);
  return scanUserCopySource(readFileSync(file, 'utf8'), { ...options, filePath });
}
