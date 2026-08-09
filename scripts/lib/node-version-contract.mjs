function readMajor(value, label) {
  const match = String(value ?? '')
    .trim()
    .match(/^[~^<>=\s]*v?(\d+)(?:\.|\s|$)/);
  if (!match) throw new Error(`${label} does not declare a readable Node major: ${value}`);
  return Number(match[1]);
}

function workflowNodeVersions({ path, content }) {
  const setupCount = [...content.matchAll(/\bactions\/setup-node@/g)].length;
  if (setupCount === 0) return [];

  const versions = [...content.matchAll(/\bnode-version:\s*['"]?([^\s'"#]+)/g)].map(
    ([, version]) => ({ path, version }),
  );
  if (versions.length !== setupCount) {
    throw new Error(
      `${path} has ${setupCount} setup-node step(s), but ${versions.length} explicit node-version value(s).`,
    );
  }
  return versions;
}

export function assertNodeVersionContract({
  nvmrc,
  nodeEngine,
  nodeTypes,
  lockedNodeTypes,
  workflows,
}) {
  const runtimeMajor = readMajor(nvmrc, '.nvmrc');
  const declarations = [
    ['package.json engines.node', nodeEngine],
    ['package.json devDependencies.@types/node', nodeTypes],
    ['package-lock.json @types/node', lockedNodeTypes],
  ];

  for (const [label, value] of declarations) {
    const major = readMajor(value, label);
    if (major !== runtimeMajor) {
      throw new Error(`${label} targets Node ${major}, but .nvmrc targets Node ${runtimeMajor}.`);
    }
  }

  const workflowVersions = workflows.flatMap(workflowNodeVersions);
  if (workflowVersions.length === 0) {
    throw new Error('No explicit actions/setup-node node-version declaration was found.');
  }
  for (const { path, version } of workflowVersions) {
    const major = readMajor(version, `${path} node-version`);
    if (major !== runtimeMajor) {
      throw new Error(`${path} targets Node ${major}, but .nvmrc targets Node ${runtimeMajor}.`);
    }
  }

  return { runtimeMajor, workflowCount: workflowVersions.length };
}
