import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEPLOYMENT_TARGETS,
  PUBLIC_BROWSER_ENVIRONMENT_KEYS,
  readPublicEnvironmentFile,
  resolveBuildEnvironment,
  resolveDeploymentCommitSha,
  resolveDeploymentTarget,
} from '../scripts/lib/environment-config.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const roots = [];

function jwt(ref, role = 'anon') {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ ref, role })}.signature`;
}

function publicPair(target) {
  return {
    VITE_PUBLIC_SUPABASE_URL: `https://${target.projectRef}.supabase.co`,
    VITE_PUBLIC_SUPABASE_ANON_KEY: jwt(target.projectRef),
  };
}

function vercel(branch, environment = 'preview') {
  return {
    VERCEL: '1',
    VERCEL_ENV: environment,
    VERCEL_GIT_COMMIT_REF: branch,
    VERCEL_GIT_COMMIT_SHA: SHA,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('public environment and deployment target contract', () => {
  it('shares immutable main/dev identities while refusing unsupported mutation targets', () => {
    expect(resolveDeploymentTarget('main')).toBe(DEPLOYMENT_TARGETS.main);
    expect(resolveDeploymentTarget('dev')).toBe(DEPLOYMENT_TARGETS.dev);
    expect(DEPLOYMENT_TARGETS.main.vercelTarget).toBe('production');
    expect(DEPLOYMENT_TARGETS.dev.vercelTarget).toBe('preview');
    expect(DEPLOYMENT_TARGETS.main.projectRef).not.toBe(DEPLOYMENT_TARGETS.dev.projectRef);
    for (const branch of ['feature/preview', 'HEAD', '', undefined, 'toString']) {
      expect(resolveDeploymentTarget(branch)).toBeNull();
    }
    expect(Object.isFrozen(DEPLOYMENT_TARGETS)).toBe(true);
    expect(Object.isFrozen(DEPLOYMENT_TARGETS.dev)).toBe(true);
  });

  it('supports local guest builds without Supabase while exposing only explicit public variables', () => {
    const env = {
      SUPABASE_SERVICE_ROLE_KEY: 'server-private-fixture',
      PRIVATE_TOKEN: 'private-token-fixture',
    };
    const result = resolveBuildEnvironment({ env });
    expect(result).toMatchObject({
      commitSha: 'local',
      environment: 'local',
      branch: null,
      target: null,
    });
    expect(result.publicEnvironment).toEqual({});
    expect(Object.keys(result.define)).toEqual(
      PUBLIC_BROWSER_ENVIRONMENT_KEYS.map((key) => `import.meta.env.${key}`),
    );
    expect(Object.values(result.define)).toEqual(
      PUBLIC_BROWSER_ENVIRONMENT_KEYS.map(() => 'undefined'),
    );
    expect(JSON.stringify(result)).not.toContain('server-private-fixture');
    expect(JSON.stringify(result)).not.toContain('private-token-fixture');
    expect(Object.isFrozen(result.publicEnvironment)).toBe(true);
    expect(Object.isFrozen(result.define)).toBe(true);
    expect(env).toEqual({
      SUPABASE_SERVICE_ROLE_KEY: 'server-private-fixture',
      PRIVATE_TOKEN: 'private-token-fixture',
    });
  });

  it('merges local mode-file values below environment overrides and keeps an immutable snapshot', () => {
    const fileEnv = { ...publicPair(DEPLOYMENT_TARGETS.dev), VITE_DB_LOG_LEVEL: 'info' };
    const env = { VITE_DB_LOG_LEVEL: 'warn', VITE_E2E_VICTORY_RUNE: '1' };
    const result = resolveBuildEnvironment({ env, fileEnv });
    expect(result.publicEnvironment).toEqual({
      ...fileEnv,
      VITE_DB_LOG_LEVEL: 'warn',
      VITE_E2E_VICTORY_RUNE: '1',
    });
    expect(result.define['import.meta.env.VITE_E2E_VICTORY_RUNE']).toBe('"1"');
    env.VITE_DB_LOG_LEVEL = 'error';
    fileEnv.VITE_PUBLIC_SUPABASE_URL = 'changed-after-snapshot';
    expect(result.publicEnvironment.VITE_DB_LOG_LEVEL).toBe('warn');
    expect(result.publicEnvironment.VITE_PUBLIC_SUPABASE_URL).toBe(
      publicPair(DEPLOYMENT_TARGETS.dev).VITE_PUBLIC_SUPABASE_URL,
    );
  });

  it.each(['dev', 'feat/environment-contract', 'fix/reliable-config', 'chore/maintenance'])(
    'routes Vercel preview %s to Dev despite production global and mode-file variables',
    (branch) => {
      const production = publicPair(DEPLOYMENT_TARGETS.main);
      const env = { ...vercel(branch), ...production, VITE_DB_LOG_LEVEL: 'warn' };
      const before = { ...env };
      const result = resolveBuildEnvironment({
        env,
        fileEnv: production,
        devPublicEnv: publicPair(DEPLOYMENT_TARGETS.dev),
      });
      expect(result).toMatchObject({
        commitSha: SHA,
        branch,
        target: DEPLOYMENT_TARGETS.dev,
        environment: 'preview',
      });
      expect(result.publicEnvironment).toEqual({
        ...publicPair(DEPLOYMENT_TARGETS.dev),
        VITE_DB_LOG_LEVEL: 'warn',
      });
      expect(result.define['import.meta.env.VITE_PUBLIC_SUPABASE_URL']).toBe(
        JSON.stringify(publicPair(DEPLOYMENT_TARGETS.dev).VITE_PUBLIC_SUPABASE_URL),
      );
      expect(env).toEqual(before);
    },
  );

  it('requires explicit provider production credentials and preserves the existing main-preview target', () => {
    for (const environment of ['production', 'preview']) {
      const result = resolveBuildEnvironment({
        env: { ...vercel('main', environment), ...publicPair(DEPLOYMENT_TARGETS.main) },
      });
      expect(result.target).toBe(DEPLOYMENT_TARGETS.main);
      expect(result.environment).toBe(environment);
      expect(result.publicEnvironment).toEqual(publicPair(DEPLOYMENT_TARGETS.main));
      expect(() =>
        resolveBuildEnvironment({
          env: vercel('main', environment),
          fileEnv: publicPair(DEPLOYMENT_TARGETS.main),
        }),
      ).toThrow('required together');
    }
  });

  it.each(['dev', 'feat/unauthorized-production'])(
    'rejects production on %s before resolving credentials',
    (branch) => {
      expect(() =>
        resolveBuildEnvironment({
          env: { ...vercel(branch, 'production'), ...publicPair(DEPLOYMENT_TARGETS.main) },
        }),
      ).toThrow('require the main branch');
    },
  );

  it.each([
    {},
    { VITE_PUBLIC_SUPABASE_URL: publicPair(DEPLOYMENT_TARGETS.dev).VITE_PUBLIC_SUPABASE_URL },
    {
      VITE_PUBLIC_SUPABASE_ANON_KEY: publicPair(DEPLOYMENT_TARGETS.dev)
        .VITE_PUBLIC_SUPABASE_ANON_KEY,
    },
  ])(
    'refuses missing dedicated preview credentials instead of borrowing production globals: %j',
    (devPublicEnv) => {
      expect(() =>
        resolveBuildEnvironment({
          env: { ...vercel('dev'), ...publicPair(DEPLOYMENT_TARGETS.main) },
          devPublicEnv,
        }),
      ).toThrow('required together');
    },
  );

  it('rejects wrong URL/project pairs and inconsistent values split across sources', () => {
    expect(() =>
      resolveBuildEnvironment({
        env: { ...vercel('main', 'production'), ...publicPair(DEPLOYMENT_TARGETS.dev) },
      }),
    ).toThrow('LolRogue Supabase project');
    expect(() =>
      resolveBuildEnvironment({
        env: vercel('dev'),
        devPublicEnv: publicPair(DEPLOYMENT_TARGETS.main),
      }),
    ).toThrow('LolRogueDev Supabase project');
    expect(() =>
      resolveBuildEnvironment({
        env: {
          ...publicPair(DEPLOYMENT_TARGETS.dev),
          VITE_PUBLIC_SUPABASE_ANON_KEY: jwt(DEPLOYMENT_TARGETS.main.projectRef),
        },
      }),
    ).toThrow('different project');
    expect(() =>
      resolveBuildEnvironment({
        env: { VITE_PUBLIC_SUPABASE_ANON_KEY: jwt(DEPLOYMENT_TARGETS.main.projectRef) },
        fileEnv: publicPair(DEPLOYMENT_TARGETS.dev),
      }),
    ).toThrow('different project');
  });

  it.each(['service_role', 'authenticated', 'postgres', undefined])(
    'rejects browser JWT role %s without revealing the credential',
    (role) => {
      const key =
        role === undefined
          ? jwt(DEPLOYMENT_TARGETS.dev.projectRef, null)
          : jwt(DEPLOYMENT_TARGETS.dev.projectRef, role);
      for (const source of ['env', 'fileEnv', 'devPublicEnv']) {
        let message = '';
        try {
          resolveBuildEnvironment({
            env: {},
            [source]: { ...publicPair(DEPLOYMENT_TARGETS.dev), VITE_PUBLIC_SUPABASE_ANON_KEY: key },
          });
        } catch (error) {
          message = error.message;
        }
        expect(message).toContain('private roles are forbidden');
        expect(message).not.toContain(key);
      }
    },
  );

  it('rejects private Preview keys even when the dedicated dev source would override them', () => {
    expect(() =>
      resolveBuildEnvironment({
        env: {
          ...vercel('dev'),
          VITE_PUBLIC_SUPABASE_ANON_KEY: jwt(DEPLOYMENT_TARGETS.main.projectRef, 'service_role'),
        },
        devPublicEnv: publicPair(DEPLOYMENT_TARGETS.dev),
      }),
    ).toThrow('private roles are forbidden');
  });

  it.each([
    'sb_secret_never_public_fixture',
    'malformed.jwt',
    'offline-anon-key',
    'sb_publishable_short',
  ])('rejects private or malformed public keys: %s', (key) => {
    expect(() =>
      resolveBuildEnvironment({
        env: { ...publicPair(DEPLOYMENT_TARGETS.dev), VITE_PUBLIC_SUPABASE_ANON_KEY: key },
      }),
    ).toThrow(/secret key|credentials|publishable key/);
  });

  it('supports Supabase publishable keys without inventing project claims', () => {
    const result = resolveBuildEnvironment({
      env: {
        ...vercel('main', 'production'),
        ...publicPair(DEPLOYMENT_TARGETS.main),
        VITE_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_public_fixture_123456',
      },
    });
    expect(result.publicEnvironment.VITE_PUBLIC_SUPABASE_ANON_KEY).toBe(
      'sb_publishable_public_fixture_123456',
    );
    expect(result.target).toBe(DEPLOYMENT_TARGETS.main);
  });

  it.each([
    'http://remote.example',
    'https://remote.example',
    `https://user:private@${DEPLOYMENT_TARGETS.dev.projectRef}.supabase.co`,
    `https://${DEPLOYMENT_TARGETS.dev.projectRef}.supabase.co/private`,
    `https://${DEPLOYMENT_TARGETS.dev.projectRef}.supabase.co?token=private`,
    'not-a-url',
  ])('rejects unsafe or non-project Supabase browser URL %s', (url) => {
    expect(() =>
      resolveBuildEnvironment({
        env: { ...publicPair(DEPLOYMENT_TARGETS.dev), VITE_PUBLIC_SUPABASE_URL: url },
      }),
    ).toThrow(/URL|HTTPS/);
  });

  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'])(
    'supports the configured local Supabase origin %s',
    (url) => {
      const result = resolveBuildEnvironment({
        env: {
          VITE_PUBLIC_SUPABASE_URL: url,
          VITE_PUBLIC_SUPABASE_ANON_KEY: jwt('supabase-local'),
        },
      });
      expect(result.publicEnvironment.VITE_PUBLIC_SUPABASE_URL).toBe(url);
      expect(result.target).toBeNull();
    },
  );

  it.each([
    'VITE_SERVICE_ROLE_KEY',
    'VITE_PUBLIC_SUPABASE_SECRET_KEY',
    'VITE_PRIVATE_SENTINEL',
    'VITE_VERCEL_GIT_COMMIT_SHA',
  ])('keeps provider and private variable %s outside the browser allowlist', (key) => {
    for (const source of ['env', 'fileEnv', 'devPublicEnv']) {
      const result = resolveBuildEnvironment({
        env: {},
        [source]: { [key]: 'private-fixture-value' },
      });
      expect(result.publicEnvironment).toEqual({});
      expect(Object.hasOwn(result.define, `import.meta.env.${key}`)).toBe(false);
      expect(JSON.stringify(result)).not.toContain('private-fixture-value');
    }
  });

  it.each([
    ['VITE_ENABLE_DB_LOGGING', 'private-logging-fixture'],
    ['VITE_DB_LOG_LEVEL', 'private-level-fixture'],
    ['VITE_E2E_VICTORY_RUNE', 'private-rune-fixture'],
  ])('validates %s values without exposing unexpected secret substitutions', (key, configured) => {
    expect(() => resolveBuildEnvironment({ env: { [key]: configured } })).toThrow(`${key} must be`);
    try {
      resolveBuildEnvironment({ env: { [key]: configured } });
    } catch (error) {
      expect(error.message).not.toContain(configured);
    }
  });

  it('reads only public env fields with normal quotes/comments and never changes the file', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'lolrogue-public-environment-'));
    roots.push(root);
    const path = resolve(root, '.env.development');
    const pair = publicPair(DEPLOYMENT_TARGETS.dev);
    const text = [
      '# public development fixture',
      `VITE_PUBLIC_SUPABASE_URL="${pair.VITE_PUBLIC_SUPABASE_URL}"`,
      `VITE_PUBLIC_SUPABASE_ANON_KEY='${pair.VITE_PUBLIC_SUPABASE_ANON_KEY}'`,
      'VITE_ENABLE_DB_LOGGING=false # opt in',
      'SUPABASE_SERVICE_ROLE_KEY=server-private-file-fixture',
      'UNRELATED_PRIVATE_TOKEN=private-file-fixture',
      '',
    ].join('\n');
    writeFileSync(path, text);
    expect(readPublicEnvironmentFile(path)).toEqual({ ...pair, VITE_ENABLE_DB_LOGGING: 'false' });
    expect(readFileSync(path, 'utf8')).toBe(text);
    expect(readPublicEnvironmentFile(resolve(root, 'missing.env'))).toEqual({});
    mkdirSync(resolve(root, 'directory.env'));
    expect(() => readPublicEnvironmentFile(resolve(root, 'directory.env'))).toThrow(
      'cannot be read',
    );
    writeFileSync(
      path,
      `VITE_PUBLIC_SUPABASE_ANON_KEY=${jwt(DEPLOYMENT_TARGETS.dev.projectRef, 'service_role')}`,
    );
    expect(() => readPublicEnvironmentFile(path)).toThrow('private roles are forbidden');
  });
});

describe('build identity provenance', () => {
  it('keeps local/full-SHA output and matching explicit/provider identities', () => {
    expect(resolveDeploymentCommitSha({})).toBe('local');
    expect(resolveDeploymentCommitSha({ APP_COMMIT_SHA: 'local' })).toBe('local');
    expect(resolveDeploymentCommitSha({ APP_COMMIT_SHA: ` ${SHA} ` })).toBe(SHA);
    expect(resolveDeploymentCommitSha({ VERCEL_GIT_COMMIT_SHA: SHA })).toBe(SHA);
    expect(
      resolveDeploymentCommitSha({ VERCEL: '1', APP_COMMIT_SHA: SHA, VERCEL_GIT_COMMIT_SHA: SHA }),
    ).toBe(SHA);
  });

  it.each(['short', 'A'.repeat(40), 'g'.repeat(40), 'a'.repeat(39)])(
    'rejects invalid identity %s even when the other source is valid',
    (invalid) => {
      expect(() =>
        resolveDeploymentCommitSha({ APP_COMMIT_SHA: invalid, VERCEL_GIT_COMMIT_SHA: SHA }),
      ).toThrow('full lowercase Git SHA');
      expect(() =>
        resolveDeploymentCommitSha({ APP_COMMIT_SHA: SHA, VERCEL_GIT_COMMIT_SHA: invalid }),
      ).toThrow('full lowercase Git SHA');
    },
  );

  it('rejects contradictory SHAs and missing Vercel identity', () => {
    expect(() =>
      resolveDeploymentCommitSha({ APP_COMMIT_SHA: SHA, VERCEL_GIT_COMMIT_SHA: OTHER_SHA }),
    ).toThrow('does not match');
    expect(() => resolveDeploymentCommitSha({ VERCEL: '1', APP_COMMIT_SHA: SHA })).toThrow(
      'must be exposed',
    );
    expect(() =>
      resolveDeploymentCommitSha({ VERCEL: '1', VERCEL_GIT_COMMIT_SHA: 'local' }),
    ).toThrow('must be exposed');
  });

  it.each([
    'HEAD',
    'feature/../main',
    'feature//invalid',
    'feature trailing-space',
    'feature/name.lock',
  ])('rejects detached or invalid provider branch %s', (branch) => {
    expect(() =>
      resolveBuildEnvironment({
        env: vercel(branch),
        devPublicEnv: publicPair(DEPLOYMENT_TARGETS.dev),
      }),
    ).toThrow('invalid or detached');
  });

  it('rejects unsupported environment and requested branches and provider mismatches', () => {
    expect(() =>
      resolveBuildEnvironment({ env: { VERCEL: '1', VERCEL_GIT_COMMIT_SHA: SHA } }),
    ).toThrow('deployment branch is required');
    expect(() => resolveBuildEnvironment({ env: vercel('dev', 'unknown') })).toThrow(
      'VERCEL_ENV must be',
    );
    expect(() =>
      resolveBuildEnvironment({ env: { LOLROGUE_DEPLOY_BRANCH: 'feature/requested' } }),
    ).toThrow('must be dev or main');
    expect(() =>
      resolveBuildEnvironment({ env: { ...vercel('dev'), LOLROGUE_DEPLOY_BRANCH: 'main' } }),
    ).toThrow('does not match VERCEL_GIT_COMMIT_REF');
  });

  it('accepts the explicit approved backend build branch when provider Git branch metadata is absent', () => {
    const result = resolveBuildEnvironment({
      env: {
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_GIT_COMMIT_SHA: SHA,
        LOLROGUE_DEPLOY_BRANCH: 'dev',
      },
      devPublicEnv: publicPair(DEPLOYMENT_TARGETS.dev),
    });
    expect(result.branch).toBe('dev');
    expect(result.target).toBe(DEPLOYMENT_TARGETS.dev);
  });
});
