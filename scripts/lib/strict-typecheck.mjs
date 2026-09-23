import { createHash } from 'node:crypto';

export const STRICT_TYPECHECK_SCOPES = ['app', 'scripts', 'e2e'];

export function diagnosticFingerprint(message) {
  return createHash('sha256').update(message).digest('hex');
}

// Parse only the pinned compiler's non-pretty, English diagnostic format.
// Any unrecognized output fails closed; no substring-based error suppression.
export function parseTypecheckOutput(output) {
  const diagnostics = [];
  const unexpected = [];
  let current;
  for (const line of output.replaceAll('\r\n', '\n').trimEnd().split('\n')) {
    const match = /^(.*?)\((\d+),(\d+)\): error TS(\d+): (.*)$/.exec(line);
    if (match) {
      current = {
        file: match[1].replaceAll('\\', '/'),
        line: Number(match[2]),
        column: Number(match[3]),
        code: Number(match[4]),
        message: match[5],
      };
      diagnostics.push(current);
    } else if (/^\s+\S/.test(line) && current) {
      current.message += `\n${line}`;
    } else if (line.trim()) {
      unexpected.push(line);
      current = undefined;
    }
  }
  return { diagnostics, unexpected };
}

export function validateStrictTypecheckPolicy(policy, versions, now = new Date()) {
  if (
    !policy ||
    policy.version !== 1 ||
    !Array.isArray(policy.exceptions) ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error('Invalid strict typecheck policy.');
  }
  if (
    typeof policy.compilerVersion !== 'string' ||
    !policy.compilerVersion ||
    policy.compilerVersion !== versions.typescript
  ) {
    throw new Error('TypeScript changed: review the strict diagnostic policy.');
  }
  const ids = new Set();
  for (const exception of policy.exceptions) {
    if (
      !exception.id ||
      ids.has(exception.id) ||
      !/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(exception.package ?? '') ||
      typeof exception.packageVersion !== 'string' ||
      !exception.packageVersion ||
      exception.packageVersion !== versions[exception.package] ||
      !exception.file?.startsWith(`node_modules/${exception.package}/`) ||
      exception.file.split('/').includes('..') ||
      !/\.d\.(?:ts|mts|cts)$/.test(exception.file) ||
      !Number.isInteger(exception.code) ||
      !exception.message ||
      !/^[a-f0-9]{64}$/.test(exception.messageSha256 ?? '') ||
      !Array.isArray(exception.scopes) ||
      exception.scopes.length === 0 ||
      new Set(exception.scopes).size !== exception.scopes.length ||
      exception.scopes.some((scope) => !STRICT_TYPECHECK_SCOPES.includes(scope)) ||
      !exception.reason ||
      !exception.reference?.startsWith('https://') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(exception.expiresOn ?? '')
    )
      throw new Error(`Invalid or stale strict exception: ${exception.id ?? 'unknown'}`);
    const expiration = new Date(`${exception.expiresOn}T00:00:00Z`);
    if (
      !Number.isFinite(expiration.getTime()) ||
      expiration.toISOString().slice(0, 10) !== exception.expiresOn ||
      now >= expiration
    )
      throw new Error(`Expired strict exception: ${exception.id}`);
    ids.add(exception.id);
  }
}

export function evaluateStrictTypecheck(results, policy, versions, now = new Date()) {
  validateStrictTypecheckPolicy(policy, versions, now);
  const failures = [];
  const accepted = [];
  const used = new Set();
  const scopes = ['node-boundary', ...STRICT_TYPECHECK_SCOPES];
  if (
    results.length !== scopes.length ||
    scopes.some((scope) => results.filter((r) => r.scope === scope).length !== 1)
  ) {
    failures.push('Expected exactly one result for each compiler scope.');
  }
  for (const result of results) {
    const { diagnostics, unexpected } = parseTypecheckOutput(result.output);
    if (result.error || result.signal || ![0, 1].includes(result.status) || unexpected.length) {
      failures.push(`${result.scope}: compiler failure or unrecognized output.`);
    }
    if ((result.status === 0) !== (diagnostics.length === 0)) {
      failures.push(`${result.scope}: exit code does not match the diagnostics.`);
    }
    for (const diagnostic of diagnostics) {
      const matches = policy.exceptions.filter(
        (exception) =>
          exception.scopes.includes(result.scope) &&
          exception.file === diagnostic.file &&
          exception.code === diagnostic.code &&
          exception.message === diagnostic.message.split('\n')[0] &&
          exception.messageSha256 === diagnosticFingerprint(diagnostic.message),
      );
      const key = `${matches[0]?.id}:${result.scope}`;
      if (matches.length !== 1 || used.has(key)) {
        failures.push(`${result.scope}: unexpected ${diagnostic.file} TS${diagnostic.code}.`);
      } else {
        used.add(key);
        accepted.push({ scope: result.scope, exception: matches[0].id, diagnostic });
      }
    }
  }
  for (const exception of policy.exceptions) {
    for (const scope of exception.scopes) {
      if (!used.has(`${exception.id}:${scope}`)) {
        failures.push(
          `${scope}: obsolete or changed exception ${exception.id}; remove or review it.`,
        );
      }
    }
  }
  return { passed: failures.length === 0, failures, accepted };
}
