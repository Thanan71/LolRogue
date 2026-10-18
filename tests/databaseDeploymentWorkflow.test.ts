import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

const workflow = readFileSync(
  new URL('../.github/workflows/database-deployment.yml', import.meta.url),
  'utf8',
);
const environmentSource = readFileSync(
  new URL('../scripts/lib/environment-config.mjs', import.meta.url),
  'utf8',
);
const databaseRouter = readFileSync(
  new URL('../scripts/commands/database/index.mjs', import.meta.url),
  'utf8',
);
const remoteOperations = readFileSync(
  new URL('../scripts/lib/remote-operation.mjs', import.meta.url),
  'utf8',
);

describe('branch-isolated Supabase database deployment', () => {
  it('parses every GitHub Actions workflow as valid YAML', () => {
    const directory = new URL('../.github/workflows/', import.meta.url);
    for (const filename of readdirSync(directory).filter((name) => /\.ya?ml$/.test(name))) {
      const document = parseDocument(readFileSync(new URL(filename, directory), 'utf8'));
      expect(
        document.errors.map((error) => error.message),
        filename,
      ).toEqual([]);
    }
  });

  it('deploys only merged dev/main commits or an explicit dispatch on these branches', () => {
    const configuration = parseDocument(workflow).toJS();
    expect(configuration.on).toHaveProperty('workflow_dispatch');
    expect(configuration.on.push.branches).toEqual(['dev', 'main']);
    expect(configuration.on.push).not.toHaveProperty('paths');
    expect(configuration.on.push).not.toHaveProperty('paths-ignore');
    expect(configuration.on).not.toHaveProperty('pull_request');
    expect(configuration.on).not.toHaveProperty('pull_request_target');
    expect(workflow).toContain(
      "if: github.ref == 'refs/heads/dev' || github.ref == 'refs/heads/main'",
    );
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"');
  });

  it('has independent environments, credentials and branch-to-project invariants', () => {
    const configuration = parseDocument(workflow).toJS();
    for (const [branch, environment] of [
      ['dev', 'supabase-dev'],
      ['main', 'main'],
    ] as const) {
      const declaredTarget = environmentSource
        .split(`${branch}: Object.freeze({`)[1]
        ?.match(/projectRef: '([a-z0-9]+)'/)?.[1];
      expect(declaredTarget).toBeTruthy();
      const section = workflow
        .split(`  deploy-${branch}:`)[1]
        ?.split(/\n  deploy-(?:dev|main):/)[0];
      expect(section).toBeTruthy();
      const job = configuration.jobs[`deploy-${branch}`];
      expect(job.environment).toBe(environment);
      expect(job.env).toEqual({
        SUPABASE_ACCESS_TOKEN: '${{ secrets.SUPABASE_ACCESS_TOKEN }}',
        SUPABASE_DB_PASSWORD: '${{ secrets.SUPABASE_DB_PASSWORD }}',
        EXPECTED_BRANCH: branch,
        EXPECTED_PROJECT_REF: declaredTarget,
      });
      expect(job.if).toBe(`github.ref == 'refs/heads/${branch}'`);
      expect(job.needs).toBe('validate-migrations');
      expect(section).toContain('test "$(git branch --show-current)" = "$EXPECTED_BRANCH"');
      expect(section).toContain('resolveDeploymentTarget');
    }
  });

  it('validates locally and refuses drift before applying remotely', () => {
    expect(workflow).toContain('npm run check:db');
    expect(workflow).toContain('npm run database -- stop');
    for (const branch of ['dev', 'main']) {
      const section = workflow.split(`  deploy-${branch}:`)[1];
      expect(section).toContain(
        'npm run database -- link --project-ref "$EXPECTED_PROJECT_REF" --yes',
      );
      const guard = section.indexOf('check-database-deploy-plan.mjs');
      const preview = section.indexOf('migrate --project-ref "$EXPECTED_PROJECT_REF" --preview');
      const apply = section.indexOf('migrate --project-ref "$EXPECTED_PROJECT_REF" --yes');
      const verify = section.indexOf(
        'migrations check --linked --project-ref "$EXPECTED_PROJECT_REF"',
      );
      expect(guard).toBeGreaterThanOrEqual(0);
      expect(preview).toBeGreaterThan(guard);
      expect(apply).toBeGreaterThan(preview);
      expect(verify).toBeGreaterThan(apply);
    }
    expect(workflow).not.toContain('--include-all');
    expect(workflow).not.toContain('--include-seed');
    expect(workflow).not.toContain('SUPABASE_DB_URL');
    expect(workflow).not.toContain('service_role');
  });

  it('uses the validated link for native Supabase commands', () => {
    const remotePush = databaseRouter.split("if (command.target.kind === 'database-migrate')")[1];
    expect(remotePush).toContain("'db',");
    expect(remotePush).toContain("'push',");
    expect(remotePush).toContain("'--linked',");
    expect(remotePush).not.toMatch(/'push',[\s\S]{0,130}'--project-ref'/);
    expect(remoteOperations).toContain("args = ['--linked'];");
    expect(remoteOperations).not.toContain("args = ['--linked', '--project-ref'");
  });
});
