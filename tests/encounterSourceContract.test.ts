import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';
import { implementedChampions } from '@/data/champion';
import type { EventOutcomeType } from '@/game/map/types';
import {
  type EncounterPresentationSource,
  type EventOutcomePresentationSource,
  getEncounterPresentation,
  getEventOutcomePresentation,
} from '@/i18n/encounterContent';

type StaticValue = boolean | string;

interface AstNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

interface EncounterSourceContract {
  readonly id: string;
  readonly source: EncounterPresentationSource;
}

interface EventOutcomeSourceContract {
  readonly id: string;
  readonly source: EventOutcomePresentationSource;
}

const generatorPath = fileURLToPath(
  new URL('../src/game/map/MapGenerator-core.ts', import.meta.url),
);
const generatorSource = readFileSync(generatorPath, 'utf8');
const generatorAst = parse(generatorSource, {
  plugins: ['typescript'],
  sourceType: 'module',
}) as unknown as AstNode;

function failContract(message: string): never {
  throw new Error(`Encounter source contract: ${message}`);
}

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string'
  );
}

function nodeField(node: AstNode, name: string): AstNode {
  const value = node[name];
  return isNode(value) ? value : failContract(`${node.type}.${name} must be an AST node`);
}

function nodeArrayField(node: AstNode, name: string): readonly AstNode[] {
  const value = node[name];
  if (!Array.isArray(value) || value.some((entry) => !isNode(entry))) {
    return failContract(`${node.type}.${name} must contain only AST nodes`);
  }
  return value;
}

function stringField(node: AstNode, name: string): string {
  const value = node[name];
  return typeof value === 'string' ? value : failContract(`${node.type}.${name} must be a string`);
}

function walk(root: AstNode, visitor: (node: AstNode) => void): void {
  visitor(root);
  for (const value of Object.values(root)) {
    if (isNode(value)) {
      walk(value, visitor);
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) if (isNode(entry)) walk(entry, visitor);
    }
  }
}

function propertyName(node: AstNode): string {
  if (node.type === 'Identifier') return stringField(node, 'name');
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') {
    return String(node.value);
  }
  return failContract(`unsupported property name ${node.type}`);
}

function findGeneratorFunction(name: string): AstNode {
  const program = nodeField(generatorAst, 'program');
  const declaration = nodeArrayField(program, 'body').find(
    (statement) =>
      statement.type === 'FunctionDeclaration' &&
      isNode(statement.id) &&
      statement.id.type === 'Identifier' &&
      statement.id.name === name,
  );
  return declaration ?? failContract(`missing generator function ${name}`);
}

function findVariable(root: AstNode, name: string): AstNode {
  let declaration: AstNode | undefined;
  walk(root, (node) => {
    if (
      !declaration &&
      node.type === 'VariableDeclarator' &&
      isNode(node.id) &&
      node.id.type === 'Identifier' &&
      node.id.name === name
    ) {
      declaration = node;
    }
  });
  return declaration ?? failContract(`missing ${name} source declaration`);
}

function findReturnObject(root: AstNode): AstNode {
  let result: AstNode | undefined;
  walk(root, (node) => {
    if (!result && node.type === 'ReturnStatement' && isNode(node.argument)) {
      result = asObject(node.argument, 'return value');
    }
  });
  return result ?? failContract('missing encounter return object');
}

function asArray(node: unknown, label: string): AstNode {
  return isNode(node) && node.type === 'ArrayExpression'
    ? node
    : failContract(`${label} must remain an array literal`);
}

function asObject(node: unknown, label: string): AstNode {
  return isNode(node) && node.type === 'ObjectExpression'
    ? node
    : failContract(`${label} must remain an object literal`);
}

function arrayElements(node: AstNode, label: string): readonly AstNode[] {
  const elements = node.elements;
  if (!Array.isArray(elements) || elements.some((entry) => !isNode(entry))) {
    return failContract(`${label} must contain only explicit values`);
  }
  return elements;
}

function getProperty(object: AstNode, name: string): AstNode {
  const property = nodeArrayField(object, 'properties').find(
    (candidate) =>
      candidate.type === 'ObjectProperty' &&
      isNode(candidate.key) &&
      propertyName(candidate.key) === name,
  );
  return property ?? failContract(`missing ${name} property in encounter source`);
}

function propertyValue(property: AstNode): AstNode {
  return nodeField(property, 'value');
}

function evaluateStaticExpression(
  expression: AstNode,
  values: Readonly<Record<string, StaticValue>> = {},
): StaticValue {
  if (expression.type === 'StringLiteral') return stringField(expression, 'value');
  if (expression.type === 'BooleanLiteral' && typeof expression.value === 'boolean') {
    return expression.value;
  }
  if (expression.type === 'Identifier') {
    const name = stringField(expression, 'name');
    return values[name] ?? failContract(`missing static value for ${name}`);
  }
  if (expression.type === 'TSAsExpression' || expression.type === 'TSNonNullExpression') {
    return evaluateStaticExpression(nodeField(expression, 'expression'), values);
  }
  if (expression.type === 'ConditionalExpression') {
    const condition = evaluateStaticExpression(nodeField(expression, 'test'), values);
    if (typeof condition !== 'boolean') return failContract('static condition is not boolean');
    return evaluateStaticExpression(
      nodeField(expression, condition ? 'consequent' : 'alternate'),
      values,
    );
  }
  if (expression.type === 'TemplateLiteral') {
    const quasis = nodeArrayField(expression, 'quasis');
    const expressions = nodeArrayField(expression, 'expressions');
    if (quasis.length !== expressions.length + 1) {
      return failContract('malformed encounter template literal');
    }
    let result = templateElementText(quasis[0]);
    for (let index = 0; index < expressions.length; index++) {
      result += String(evaluateStaticExpression(expressions[index], values));
      result += templateElementText(quasis[index + 1]);
    }
    return result;
  }
  if (expression.type === 'CallExpression') {
    const callee = nodeField(expression, 'callee');
    if (callee.type === 'MemberExpression' && isNode(callee.object) && isNode(callee.property)) {
      const receiver = evaluateStaticExpression(callee.object, values);
      const method = propertyName(callee.property);
      const args = nodeArrayField(expression, 'arguments');
      if (typeof receiver !== 'string') return failContract(`${method} receiver is not text`);
      if (method === 'toLowerCase' && args.length === 0) return receiver.toLowerCase();
      if (method === 'replace' && args.length === 2) {
        const search = evaluateStaticExpression(args[0], values);
        const replacement = evaluateStaticExpression(args[1], values);
        if (typeof search === 'string' && typeof replacement === 'string') {
          return receiver.replace(search, replacement);
        }
      }
    }
  }
  return failContract(`unsupported static expression ${expression.type}`);
}

function templateElementText(element: AstNode): string {
  const value = element.value;
  if (typeof value !== 'object' || value === null) {
    return failContract('template element has no value');
  }
  const cooked = Reflect.get(value, 'cooked');
  return typeof cooked === 'string' ? cooked : failContract('template element has no cooked text');
}

function evaluateText(
  expression: AstNode,
  values: Readonly<Record<string, StaticValue>> = {},
): string {
  const value = evaluateStaticExpression(expression, values);
  return typeof value === 'string'
    ? value
    : failContract(`${expression.type} did not produce text`);
}

function readStringArray(functionName: string, variableName: string): readonly string[] {
  const declaration = findVariable(findGeneratorFunction(functionName), variableName);
  return arrayElements(asArray(declaration.init, variableName), variableName).map((element) =>
    evaluateText(element),
  );
}

function readStringRecord(
  functionName: string,
  variableName: string,
): Readonly<Record<string, string>> {
  const declaration = findVariable(findGeneratorFunction(functionName), variableName);
  const object = asObject(declaration.init, variableName);
  return Object.fromEntries(
    nodeArrayField(object, 'properties').map((property) => {
      if (property.type !== 'ObjectProperty') {
        return failContract(`${variableName} must contain only explicit properties`);
      }
      return [propertyName(nodeField(property, 'key')), evaluateText(propertyValue(property))];
    }),
  );
}

function buildEncounterSourceContracts(): readonly EncounterSourceContract[] {
  const shopFunction = findGeneratorFunction('generateShopEncounter');
  const shopDescription = propertyValue(getProperty(findReturnObject(shopFunction), 'description'));
  const shopNames = readStringRecord('generateShopEncounter', 'shopNames');
  const biomeIds = Object.keys(shopNames);
  const shops = biomeIds.map((biome) => ({
    id: `shop:${biome}`,
    source: {
      type: 'shop' as const,
      name: shopNames[biome],
      description: evaluateText(shopDescription, { biome }),
    },
  }));

  const restFunction = findGeneratorFunction('generateRestEncounter');
  const restDescription = propertyValue(getProperty(findReturnObject(restFunction), 'description'));
  const restNames = readStringArray('generateRestEncounter', 'restNames');
  const rests = restNames.flatMap((name) =>
    [true, false].map((fullHeal) => ({
      id: `rest:${name}:${fullHeal ? 'full' : 'partial'}`,
      source: {
        type: 'rest' as const,
        name,
        description: evaluateText(restDescription, { fullHeal }),
      },
    })),
  );

  const eventPool = asArray(
    findVariable(findGeneratorFunction('generateEventEncounter'), 'eventPool').init,
    'eventPool',
  );
  const events = arrayElements(eventPool, 'eventPool').map((element, index) => {
    const event = asObject(element, `eventPool[${index}]`);
    const name = evaluateText(propertyValue(getProperty(event, 'name')));
    return {
      id: `event:${name}`,
      source: {
        type: 'event' as const,
        name,
        description: evaluateText(propertyValue(getProperty(event, 'description'))),
      },
    };
  });

  const recruitReturn = findReturnObject(findGeneratorFunction('generateRecruitEncounter'));
  const recruitName = propertyValue(getProperty(recruitReturn, 'name'));
  const recruitDescription = propertyValue(getProperty(recruitReturn, 'description'));
  const recruits = implementedChampions.map(({ id: championId }) => ({
    id: `recruit:${championId}`,
    source: {
      type: 'recruit' as const,
      championId,
      name: evaluateText(recruitName, { championId }),
      description: evaluateText(recruitDescription, { championId }),
    },
  }));

  const treasureFunction = findGeneratorFunction('generateTreasureEncounter');
  const treasureDescription = propertyValue(
    getProperty(findReturnObject(treasureFunction), 'description'),
  );
  const treasureNames = readStringArray('generateTreasureEncounter', 'treasureNames');
  const treasures = treasureNames.flatMap((name) =>
    biomeIds.map((biome) => ({
      id: `treasure:${name}:${biome}`,
      source: {
        type: 'treasure' as const,
        name,
        description: evaluateText(treasureDescription, { biome, name }),
      },
    })),
  );

  return [...shops, ...rests, ...events, ...recruits, ...treasures];
}

function buildEventOutcomeSourceContracts(): readonly EventOutcomeSourceContract[] {
  const eventPool = asArray(
    findVariable(findGeneratorFunction('generateEventEncounter'), 'eventPool').init,
    'eventPool',
  );

  return arrayElements(eventPool, 'eventPool').flatMap((element, eventIndex) => {
    const event = asObject(element, `eventPool[${eventIndex}]`);
    const eventName = evaluateText(propertyValue(getProperty(event, 'name')));
    const outcomes = asArray(
      propertyValue(getProperty(event, 'outcomes')),
      `${eventName}.outcomes`,
    );
    return arrayElements(outcomes, `${eventName}.outcomes`).map((outcomeElement, outcomeIndex) => {
      const outcome = asObject(outcomeElement, `${eventName}.outcomes[${outcomeIndex}]`);
      return {
        id: `event:${eventName}:outcome:${outcomeIndex}`,
        source: {
          type: evaluateText(propertyValue(getProperty(outcome, 'type'))) as EventOutcomeType,
          description: evaluateText(propertyValue(getProperty(outcome, 'description'))),
        },
      };
    });
  });
}

function encounterGeneratorNames(): readonly string[] {
  const names = new Set<string>();
  walk(findGeneratorFunction('generateEncounterForNode'), (node) => {
    if (
      node.type !== 'CallExpression' ||
      !isNode(node.callee) ||
      node.callee.type !== 'Identifier'
    ) {
      return;
    }
    const name = stringField(node.callee, 'name');
    if (/^generate[A-Z].*Encounter$/.test(name)) names.add(name);
  });
  return [...names].sort();
}

function expectCompleteEncounterTranslation({ id, source }: EncounterSourceContract): void {
  const before = structuredClone(source);
  const english = getEncounterPresentation('en-US', source);
  const french = getEncounterPresentation('fr-FR', source);

  expect(english.resolution, `${id} has no explicit en-US catalog entry`).toBe('catalog');
  expect(french.resolution, `${id} has no explicit fr-FR catalog entry`).toBe('catalog');
  expect(english.name, `${id} changed its canonical en-US name`).toBe(source.name);
  expect(english.description, `${id} changed its canonical en-US description`).toBe(
    source.description,
  );
  expect(french.name.trim(), `${id} has an empty fr-FR name`).not.toBe('');
  expect(french.description.trim(), `${id} has an empty fr-FR description`).not.toBe('');
  expect(french.description, `${id} still exposes its en-US description in fr-FR`).not.toBe(
    english.description,
  );
  expect(source, `${id} presentation mutated the canonical payload`).toEqual(before);
}

function expectCompleteOutcomeTranslation({ id, source }: EventOutcomeSourceContract): void {
  const before = structuredClone(source);
  const english = getEventOutcomePresentation('en-US', source);
  const french = getEventOutcomePresentation('fr-FR', source);

  expect(english.resolution, `${id} has no explicit en-US catalog entry`).toBe('catalog');
  expect(french.resolution, `${id} has no explicit fr-FR catalog entry`).toBe('catalog');
  expect(english.description, `${id} changed its canonical en-US description`).toBe(
    source.description,
  );
  expect(french.description.trim(), `${id} has an empty fr-FR description`).not.toBe('');
  expect(french.description, `${id} still exposes its en-US description in fr-FR`).not.toBe(
    english.description,
  );
  expect(source, `${id} presentation mutated the canonical payload`).toEqual(before);
}

describe('encounter generator source contract', () => {
  it('tracks every non-combat encounter generator explicitly', () => {
    expect(encounterGeneratorNames()).toEqual([
      'generateEventEncounter',
      'generateRecruitEncounter',
      'generateRestEncounter',
      'generateShopEncounter',
      'generateTreasureEncounter',
    ]);
  });

  it('covers every declared non-combat encounter source in both locales', () => {
    const contracts = buildEncounterSourceContracts();
    expect(new Set(contracts.map(({ id }) => id)).size).toBe(contracts.length);
    for (const contract of contracts) expectCompleteEncounterTranslation(contract);
  });

  it('covers every declared event outcome source in both locales', () => {
    const contracts = buildEventOutcomeSourceContracts();
    expect(new Set(contracts.map(({ id }) => id)).size).toBe(contracts.length);
    for (const contract of contracts) expectCompleteOutcomeTranslation(contract);
  });
});
