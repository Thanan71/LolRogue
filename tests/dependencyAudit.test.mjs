import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateDependencyAudit } from '../scripts/lib/dependency-audit.mjs';

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function report() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    },
  };
}

function result(data = report(), status = 0) {
  return { status, signal: null, stdout: JSON.stringify(data), stderr: '', error: undefined };
}

function advisory(severity) {
  const data = report();
  data.vulnerabilities = { 'example-package': { severity } };
  data.metadata.vulnerabilities[severity] = 1;
  data.metadata.vulnerabilities.total = 1;
  return data;
}

describe('dependency audit gate', () => {
  it('accepts a complete zero-advisory npm report', () => {
    expect(() => validateDependencyAudit(result())).not.toThrow();
  });

  it.each(['low', 'moderate'])('keeps %s advisories below the blocking threshold', (severity) => {
    expect(() => validateDependencyAudit(result(advisory(severity), 1))).not.toThrow();
  });

  it.each(['high', 'critical'])('blocks a %s advisory regardless of exit code', (severity) => {
    for (const status of [0, 1]) {
      expect(() => validateDependencyAudit(result(advisory(severity), status))).toThrow(
        `example-package (${severity})`,
      );
    }
  });

  it.each([
    ['spawn error', { error: new Error('ENOENT') }],
    ['termination signal', { status: null, signal: 'SIGTERM' }],
    ['missing process status', { status: null }],
    ['unexpected nonzero status', { status: 2 }],
    ['zero-advisory failure status', { status: 1 }],
    ['empty output', { stdout: '' }],
    ['missing output', { stdout: null }],
    ['malformed JSON', { stdout: '{' }],
  ])('rejects %s even when other data looks valid', (_name, override) => {
    expect(() => validateDependencyAudit({ ...result(), ...override })).toThrow();
  });

  it.each([
    ['registry error', { error: { code: 'E503', summary: 'Registry unavailable' } }],
    ['empty object', {}],
    ['null report', null],
    ['array report', []],
    ['unsupported report version', { ...report(), auditReportVersion: 3 }],
    ['missing vulnerabilities', { ...report(), vulnerabilities: undefined }],
    ['array vulnerabilities', { ...report(), vulnerabilities: [] }],
    ['missing metadata', { ...report(), metadata: undefined }],
  ])('rejects %s rather than treating it as a clean audit', (_name, data) => {
    expect(() => validateDependencyAudit(result(data))).toThrow();
  });

  it.each([undefined, '0', -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects a malformed high count: %s',
    (high) => {
      const data = report();
      data.metadata.vulnerabilities.high = high;
      expect(() => validateDependencyAudit(result(data))).toThrow('counts');
    },
  );

  it('rejects a hidden high advisory when the summary and entries disagree', () => {
    const data = report();
    data.metadata.vulnerabilities.high = 1;
    data.metadata.vulnerabilities.total = 1;
    expect(() => validateDependencyAudit(result(data, 1))).toThrow('inconsistent');
  });

  it('rejects an entry omitted from the summary and an unsupported entry severity', () => {
    const data = advisory('high');
    data.metadata.vulnerabilities.high = 0;
    expect(() => validateDependencyAudit(result(data, 1))).toThrow('inconsistent');
    data.vulnerabilities['example-package'].severity = 'unknown';
    expect(() => validateDependencyAudit(result(data, 1))).toThrow('invalid vulnerability');
  });

  it('makes the actual CLI fail on a registry error without printing a successful audit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lolrogue-audit-gate-'));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, 'npm'),
      '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({error:{code:"E503"}}));process.exit(1);\n',
      { mode: 0o700 },
    );
    const execution = spawnSync(process.execPath, ['scripts/check-dependency-audit.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}` },
    });
    expect(execution.status).toBe(1);
    expect(execution.stdout).not.toContain('no high or critical vulnerabilities');
    expect(execution.stderr).toContain('error or unsupported report');
  });
});
