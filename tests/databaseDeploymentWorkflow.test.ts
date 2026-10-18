import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
  it('deploys only merged dev/main commits or an explicit dispatch on these branches', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('  push:');
    expect(workflow).toContain('      - dev\n      - main');
    expect(workflow).not.toContain('  pull_request:');
    expect(workflow).toContain(
      "if: github.ref == 'refs/heads/dev' || github.ref == 'refs/heads/main'",
    );
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"');
  });

  it('has independent environments, credentials and branch-to-project invariants', () => {
    for (const [branch, environment] of [
      ['dev', 'supabase-dev'],
      ['main', 'supabase-production'],
    ] as const) {
      const declaredTarget = environmentSource
        .split(`${branch}: Object.freeze({`)[1]
        ?.match(/projectRef: '([a-z0-9]+)'/)?.[1];
      expect(declaredTarget).toBeTruthy();
      const section = workflow
        .split(`  deploy-${branch}:`)[1]
        ?.split(/\n  deploy-(?:dev|main):/)[0];
      expect(section).toBeTruthy();
      expect(section).toContain(`environment: ${environment}`);
      expect(section).toContain(`EXPECTED_BRANCH: ${branch}`);
      expect(section).toContain(`EXPECTED_PROJECT_REF: ${declaredTarget}`);
      expect(section).toContain(`if: github.ref == 'refs/heads/${branch}'`);
      expect(section).toContain('SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}');
      expect(section).toContain('SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}');
      expect(section).toContain('test "$(git branch --show-current)" = "$EXPECTED_BRANCH"');
      expect(section).toContain('resolveDeploymentTarget');
      expect(section).toContain('needs: validate-migrations');
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

  it('passes only the flags supported by the actual Supabase CLI', () => {
    const remotePush = databaseRouter.split("if (command.target.kind === 'database-migrate')")[1];
    expect(remotePush).toContain("'db',");
    expect(remotePush).toContain("'push',");
    expect(remotePush).toContain("'--linked',");
    expect(remotePush).not.toMatch(/'push',[\s\S]{0,130}'--project-ref'/);
    expect(remoteOperations).toContain("args = ['--linked'];");
    expect(remoteOperations).not.toContain("args = ['--linked', '--project-ref'");
  });
});
