const severities = ['info', 'low', 'moderate', 'high', 'critical'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** npm exit 1 is valid only for a complete advisory report, never an execution error. */
export function validateDependencyAudit(result) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    throw new Error('npm audit did not complete successfully.');
  }
  if (typeof result.stdout !== 'string' || !result.stdout.trim()) {
    throw new Error('npm audit did not return a JSON report.');
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error('npm audit returned malformed JSON.');
  }
  if (
    !isRecord(report) ||
    Object.hasOwn(report, 'error') ||
    report.auditReportVersion !== 2 ||
    !isRecord(report.vulnerabilities) ||
    !isRecord(report.metadata) ||
    !isRecord(report.metadata.vulnerabilities)
  ) {
    throw new Error('npm audit returned an error or unsupported report.');
  }

  const counts = report.metadata.vulnerabilities;
  if (
    ![...severities, 'total'].every(
      (severity) => Number.isSafeInteger(counts[severity]) && counts[severity] >= 0,
    )
  ) {
    throw new Error('npm audit returned missing or malformed vulnerability counts.');
  }
  const vulnerabilities = Object.entries(report.vulnerabilities);
  const observed = Object.fromEntries(severities.map((severity) => [severity, 0]));
  for (const [, vulnerability] of vulnerabilities) {
    if (!isRecord(vulnerability) || !severities.includes(vulnerability.severity)) {
      throw new Error('npm audit returned an invalid vulnerability entry.');
    }
    observed[vulnerability.severity] += 1;
  }
  if (
    counts.total !== vulnerabilities.length ||
    !severities.every((severity) => counts[severity] === observed[severity]) ||
    (result.status === 1 && counts.total === 0)
  ) {
    throw new Error('npm audit returned inconsistent vulnerability counts or exit status.');
  }
  const blocking = vulnerabilities
    .filter(([, vulnerability]) => ['high', 'critical'].includes(vulnerability.severity))
    .map(([name, vulnerability]) => `${name} (${vulnerability.severity})`);
  if (blocking.length > 0) {
    throw new Error(`Unaccepted high/critical npm advisories: ${blocking.join(', ')}`);
  }
}
