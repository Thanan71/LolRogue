const ADVISOR_TYPES = ['security', 'performance'];
const ADVISOR_LEVELS = ['INFO', 'WARN', 'ERROR'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Supabase advisor policy: ${message}`);
}

export function validateAdvisorPolicy(policy) {
  assert(policy?.schemaVersion === 1, 'schemaVersion must be 1.');
  assert(
    policy.blockingLevels && typeof policy.blockingLevels === 'object',
    'blockingLevels is required.',
  );
  for (const type of ADVISOR_TYPES) {
    const levels = policy.blockingLevels[type];
    assert(Array.isArray(levels), `blockingLevels.${type} must be an array.`);
    assert(
      levels.every((level) => ADVISOR_LEVELS.includes(level)),
      `blockingLevels.${type} contains an invalid level.`,
    );
    assert(new Set(levels).size === levels.length, `blockingLevels.${type} contains duplicates.`);
  }
  assert(
    policy.blockingLevels.security.includes('ERROR'),
    'security ERROR findings must always be blocking.',
  );
  assert(
    typeof policy.rejectUnknownFindings === 'boolean',
    'rejectUnknownFindings must be boolean.',
  );
  assert(typeof policy.enforceExpiration === 'boolean', 'enforceExpiration must be boolean.');
  assert(Array.isArray(policy.exceptions), 'exceptions must be an array.');

  const identities = new Set();
  for (const [index, exception] of policy.exceptions.entries()) {
    const label = `exceptions[${index}]`;
    assert(ADVISOR_TYPES.includes(exception.type), `${label}.type is invalid.`);
    assert(
      typeof exception.cacheKey === 'string' && exception.cacheKey.length > 0,
      `${label}.cacheKey is required.`,
    );
    assert(
      typeof exception.name === 'string' && exception.name.length > 0,
      `${label}.name is required.`,
    );
    assert(ADVISOR_LEVELS.includes(exception.level), `${label}.level is invalid.`);
    assert(
      typeof exception.justification === 'string' && exception.justification.length >= 20,
      `${label}.justification must contain at least 20 characters.`,
    );
    assert(DATE_PATTERN.test(exception.expiresAt), `${label}.expiresAt must use YYYY-MM-DD.`);
    assert(
      !Number.isNaN(Date.parse(`${exception.expiresAt}T00:00:00Z`)),
      `${label}.expiresAt is invalid.`,
    );
    const identity = `${exception.type}:${exception.cacheKey}`;
    assert(!identities.has(identity), `${identity} is duplicated.`);
    identities.add(identity);
  }
  return policy;
}

function findingIdentity(type, finding) {
  return `${type}:${finding.cacheKey}`;
}

export function evaluateAdvisorFindings(policyInput, reports, today = new Date()) {
  const policy = validateAdvisorPolicy(policyInput);
  const blockers = [];
  const findings = [];
  const exceptions = new Map(
    policy.exceptions.map((exception) => [`${exception.type}:${exception.cacheKey}`, exception]),
  );

  for (const type of ADVISOR_TYPES) {
    const report = reports[type];
    if (!report || !Array.isArray(report.results)) {
      blockers.push({ code: 'invalid-report', detail: `${type} report has no results array.` });
      continue;
    }
    for (const finding of report.results) {
      const level = String(finding.level ?? '').toUpperCase();
      const identity = findingIdentity(type, finding);
      findings.push({ type, ...finding, level, identity });
      if (policy.blockingLevels[type].includes(level)) {
        blockers.push({
          code: `${type}-blocking-level`,
          detail: `${identity} has blocking level ${level}.`,
        });
        continue;
      }

      const exception = exceptions.get(identity);
      if (policy.rejectUnknownFindings && !exception) {
        blockers.push({ code: 'unknown-finding', detail: `${identity} is not allowlisted.` });
        continue;
      }
      if (exception && (exception.name !== finding.name || exception.level !== level)) {
        blockers.push({
          code: 'finding-contract-changed',
          detail: `${identity} no longer matches its allowlisted name and level.`,
        });
      }
      if (exception && policy.enforceExpiration) {
        const currentDate = today.toISOString().slice(0, 10);
        if (exception.expiresAt < currentDate) {
          blockers.push({
            code: 'expired-exception',
            detail: `${identity} expired on ${exception.expiresAt}.`,
          });
        }
      }
    }
  }

  return { blockers, findings };
}
