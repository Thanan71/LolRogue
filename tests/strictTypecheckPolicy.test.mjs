import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  diagnosticFingerprint,
  evaluateStrictTypecheck,
  parseTypecheckOutput,
  STRICT_TYPECHECK_SCOPES,
  validateStrictTypecheckPolicy,
} from '../scripts/lib/strict-typecheck.mjs';

const now = new Date('2026-09-23T12:00:00Z');
const file = 'node_modules/upstream-types/index.d.ts';
const message =
  "Interface 'Future' incorrectly extends interface 'Current'.\n  Incompatible return type.\n    Type 'number' is not assignable to type 'string'.";
const output = `${file}(12,7): error TS2430: ${message}\n`;

function fixture() {
  return {
    versions: { typescript: '7.0.2', 'upstream-types': '1.2.3' },
    policy: {
      version: 1,
      compilerVersion: '7.0.2',
      exceptions: [
        {
          id: 'upstream-future-declaration',
          package: 'upstream-types',
          packageVersion: '1.2.3',
          file,
          code: 2430,
          message: message.split('\n')[0],
          messageSha256: diagnosticFingerprint(message),
          scopes: [...STRICT_TYPECHECK_SCOPES],
          reason: 'Pinned upstream declaration is incompatible with the compiler DOM types.',
          reference: 'https://example.com/upstream-types/issues/1',
          expiresOn: '2026-10-23',
        },
      ],
    },
    results: [
      { scope: 'node-boundary', status: 0, signal: null, error: null, output: '' },
      ...STRICT_TYPECHECK_SCOPES.map((scope) => ({
        scope,
        status: 1,
        signal: null,
        error: null,
        output,
      })),
    ],
  };
}

function evaluate({ results, policy, versions }) {
  return evaluateStrictTypecheck(results, policy, versions, now);
}

describe('strict compiler diagnostic parsing', () => {
  it('normalizes CRLF and Windows paths while retaining exact multiline messages', () => {
    const windowsOutput = output.replaceAll('/', '\\').replaceAll('\n', '\r\n');
    expect(parseTypecheckOutput(windowsOutput)).toEqual({
      diagnostics: [{ file, line: 12, column: 7, code: 2430, message }],
      unexpected: [],
    });
  });

  it('starts a fresh diagnostic for each header and does not merge separate errors', () => {
    const parsed = parseTypecheckOutput(
      `${output}${file}(40,2): error TS2503: Missing namespace.\n`,
    );
    expect(parsed.diagnostics).toHaveLength(2);
    expect(parsed.diagnostics[0].message).toBe(message);
    expect(parsed.diagnostics[1]).toMatchObject({
      line: 40,
      column: 2,
      code: 2503,
      message: 'Missing namespace.',
    });
    expect(parsed.unexpected).toEqual([]);
  });

  it('preserves unparsed errors and banners instead of silently discarding them', () => {
    const parsed = parseTypecheckOutput(
      `${output}compiler crashed\n  orphan detail\nerror TS18003: No inputs found.\n`,
    );
    expect(parsed.unexpected).toEqual([
      'compiler crashed',
      '  orphan detail',
      'error TS18003: No inputs found.',
    ]);
    expect(parseTypecheckOutput(' \r\n\n')).toEqual({ diagnostics: [], unexpected: [] });
  });

  it('fingerprints the whole message, including nested details and whitespace', () => {
    expect(diagnosticFingerprint(message)).toMatch(/^[a-f0-9]{64}$/);
    expect(diagnosticFingerprint(message)).not.toBe(diagnosticFingerprint(message.split('\n')[0]));
    expect(diagnosticFingerprint(message)).not.toBe(diagnosticFingerprint(`${message} `));
  });
});

describe('strict compilation exception matching', () => {
  it('accepts exactly one known diagnostic per strict scope while keeping Node clean', () => {
    const result = evaluate(fixture());
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.accepted.map((entry) => entry.scope)).toEqual(['app', 'scripts', 'e2e']);
  });

  it('accepts entirely clean compilations when no exceptions remain', () => {
    const data = fixture();
    data.policy.exceptions = [];
    data.results = data.results.map((result) => ({ ...result, status: 0, output: '' }));
    expect(evaluate(data)).toEqual({ passed: true, failures: [], accepted: [] });
  });

  it.each([
    ['changed file', output.replace(file, 'node_modules/upstream-types/other.d.ts')],
    ['changed error code', output.replace('TS2430', 'TS2503')],
    ['changed header message', output.replace("Interface 'Future'", "Interface 'Other'")],
    ['changed nested message', output.replace("Type 'number'", "Type 'boolean'")],
    ['missing nested message', `${file}(12,7): error TS2430: ${message.split('\n')[0]}\n`],
    ['duplicate diagnostic', `${output}${output}`],
    ['new diagnostic', `${output}src/app.ts(1,1): error TS2322: Incorrect assignment.\n`],
    ['unrecognized stderr', `${output}Unexpected compiler warning\n`],
    ['indented stderr', `${output}  Unexpected compiler warning\n`],
  ])('rejects %s, even beside a known diagnostic', (_name, changedOutput) => {
    const data = fixture();
    data.results[1].output = changedOutput;
    expect(evaluate(data).passed).toBe(false);
    expect(evaluate(data).failures.length).toBeGreaterThan(0);
  });

  it('rejects known errors in the Node-only boundary instead of granting it an exception', () => {
    const data = fixture();
    data.results[0] = { ...data.results[0], status: 1, output };
    expect(evaluate(data).failures).toEqual(
      expect.arrayContaining([expect.stringContaining('node-boundary: unexpected')]),
    );
  });

  it('rejects ambiguous exceptions even when they have distinct IDs', () => {
    const data = fixture();
    data.policy.exceptions.push({ ...data.policy.exceptions[0], id: 'duplicate-signature' });
    expect(evaluate(data).passed).toBe(false);
    expect(evaluate(data).accepted).toEqual([]);
  });

  it('fails when an exception becomes obsolete in any declared scope', () => {
    const data = fixture();
    data.results[2] = { ...data.results[2], status: 0, output: '' };
    expect(evaluate(data).failures).toEqual(
      expect.arrayContaining([expect.stringContaining('scripts: obsolete or changed exception')]),
    );
  });

  it.each(['missing', 'duplicate', 'unknown'])('rejects a %s compilation scope', (kind) => {
    const data = fixture();
    if (kind === 'missing') data.results.pop();
    if (kind === 'duplicate') data.results.push({ ...data.results[1] });
    if (kind === 'unknown') data.results[1].scope = 'unknown';
    expect(evaluate(data).failures).toContain(
      'Expected exactly one result for each compiler scope.',
    );
  });

  it.each([
    ['non-diagnostic failure status', { status: 2 }],
    ['missing exit status', { status: null }],
    ['success with diagnostics', { status: 0 }],
    ['failure without diagnostics', { status: 1, output: '' }],
    ['termination signal', { signal: 'SIGTERM' }],
    ['spawn failure', { error: 'ETIMEDOUT' }],
  ])('never accepts %s as a known upstream error', (_name, changes) => {
    const data = fixture();
    Object.assign(data.results[1], changes);
    expect(evaluate(data).passed).toBe(false);
  });
});

describe('strict exception policy validity', () => {
  it('validates exact compiler and package versions with a fixed audit date', () => {
    const { policy, versions } = fixture();
    expect(() => validateStrictTypecheckPolicy(policy, versions, now)).not.toThrow();
    for (const changed of [
      { ...versions, typescript: '7.0.3' },
      { ...versions, 'upstream-types': '1.2.4' },
    ]) {
      expect(() => validateStrictTypecheckPolicy(policy, changed, now)).toThrow();
    }
  });

  it('does not treat missing compiler or package versions as an exact match', () => {
    const { policy, versions } = fixture();
    delete policy.compilerVersion;
    delete versions.typescript;
    expect(() => validateStrictTypecheckPolicy(policy, versions, now)).toThrow();

    const data = fixture();
    delete data.policy.exceptions[0].packageVersion;
    delete data.versions['upstream-types'];
    expect(() => validateStrictTypecheckPolicy(data.policy, data.versions, now)).toThrow();
  });

  it('rejects null policies and invalid audit dates', () => {
    const { policy, versions } = fixture();
    expect(() => validateStrictTypecheckPolicy(null, versions, now)).toThrow('Invalid');
    expect(() => validateStrictTypecheckPolicy(policy, versions, new Date('invalid'))).toThrow(
      'Invalid',
    );
  });

  it.each(['ts', 'mts', 'cts'])(
    'accepts scoped-package .d.%s declaration identities',
    (extension) => {
      const { policy, versions } = fixture();
      Object.assign(policy.exceptions[0], {
        package: '@scope/upstream-types',
        file: `node_modules/@scope/upstream-types/index.d.${extension}`,
      });
      versions['@scope/upstream-types'] = '1.2.3';
      expect(() => validateStrictTypecheckPolicy(policy, versions, now)).not.toThrow();
    },
  );

  it.each([
    ['project source', { file: 'src/types/upstream.d.ts' }],
    ['other package declaration', { file: 'node_modules/another-package/index.d.ts' }],
    ['directory traversal', { file: 'node_modules/upstream-types/../../src/hidden.d.ts' }],
    ['runtime source', { file: 'node_modules/upstream-types/index.ts' }],
    ['wildcard package', { package: '*' }],
    ['empty scopes', { scopes: [] }],
    ['duplicate scopes', { scopes: ['app', 'app'] }],
    ['Node boundary scope', { scopes: ['node-boundary'] }],
    ['unknown scope', { scopes: ['unknown'] }],
    ['noninteger diagnostic code', { code: '2430' }],
    ['empty message', { message: '' }],
    ['invalid fingerprint', { messageSha256: '*' }],
    ['missing justification', { reason: '' }],
    ['insecure reference', { reference: 'http://example.com/issue' }],
    ['malformed expiration', { expiresOn: 'later' }],
    ['impossible date', { expiresOn: '2026-02-30' }],
  ])('rejects %s exceptions before considering compiler results', (_name, changes) => {
    const { policy, versions } = fixture();
    Object.assign(policy.exceptions[0], changes);
    expect(() => validateStrictTypecheckPolicy(policy, versions, now)).toThrow();
  });

  it('expires exceptions at the start of the stated UTC day', () => {
    const { policy, versions } = fixture();
    expect(() =>
      validateStrictTypecheckPolicy(policy, versions, new Date('2026-10-22T23:59:59Z')),
    ).not.toThrow();
    expect(() =>
      validateStrictTypecheckPolicy(policy, versions, new Date('2026-10-23T00:00:00Z')),
    ).toThrow('Expired');
    expect(() =>
      validateStrictTypecheckPolicy(policy, versions, new Date('2026-10-24T00:00:00Z')),
    ).toThrow('Expired');
  });

  it('rejects duplicate IDs and unsupported policy schemas', () => {
    const { policy, versions } = fixture();
    policy.exceptions.push({ ...policy.exceptions[0] });
    expect(() => validateStrictTypecheckPolicy(policy, versions, now)).toThrow();
    expect(() => validateStrictTypecheckPolicy({ ...policy, version: 2 }, versions, now)).toThrow(
      'Invalid',
    );
    expect(() =>
      validateStrictTypecheckPolicy({ ...policy, exceptions: null }, versions, now),
    ).toThrow('Invalid');
  });
});

describe('strict scripts declaration environment', () => {
  it('adds DOM only for dependency checking and excludes only the Node sentinel', () => {
    const readConfig = (name) =>
      JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
    const fast = readConfig('tsconfig.scripts.json');
    const strict = readConfig('tsconfig.scripts.strict.json');
    expect(fast.compilerOptions.lib).toEqual(['ES2023']);
    expect(fast.compilerOptions.types).toEqual(['node']);
    expect(fast.include).toContain('scripts/**/*.ts');
    expect(fast.exclude ?? []).not.toContain('scripts/typecheck/node-globals.ts');
    expect(strict).toEqual({
      extends: './tsconfig.scripts.json',
      compilerOptions: { skipLibCheck: false, lib: ['ES2023', 'DOM', 'DOM.Iterable'] },
      exclude: ['scripts/typecheck/node-globals.ts'],
    });
  });
});
