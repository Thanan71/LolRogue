import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild-authority';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const authDirectory = path.dirname(require.resolve('@supabase/auth-js/package.json'));

/** Bundle the real published entrypoints, including their real storage capability probe. */
const builds = ['module', 'main'].map((format) => ({
  format,
  source: buildSync({
    entryPoints: [path.join(authDirectory, 'dist', format, 'index.js')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'cjs',
    logLevel: 'silent',
  }).outputFiles[0].text,
}));

function evaluate(source, descriptor) {
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    window: {},
    document: {},
    navigator: {},
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
  };
  Object.defineProperty(context, 'localStorage', { configurable: true, ...descriptor });
  runInNewContext(source, context, { timeout: 2_000 });
  return module.exports;
}

function storage(debugValue) {
  return {
    getItem: vi.fn(() => debugValue),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
}

describe('Supabase SDK import with unavailable browser storage', () => {
  for (const { format, source } of builds) {
    it.each(['SecurityError', 'QuotaExceededError'])(
      `${format} imports when getItem throws %s but capability writes succeed`,
      (name) => {
        const backend = storage(null);
        backend.getItem.mockImplementation(() => {
          throw new DOMException('blocked', name);
        });
        const sdk = evaluate(source, { value: backend });
        expect(typeof sdk.AuthClient).toBe('function');
        expect(sdk.lockInternals.debug).toBe(false);
        expect(backend.setItem).toHaveBeenCalled();
        expect(backend.removeItem).toHaveBeenCalled();
        expect(backend.getItem).toHaveBeenCalledWith('supabase.gotrue-js.locks.debug');
      },
    );

    it(`${format} imports with an inaccessible localStorage property`, () => {
      const sdk = evaluate(source, {
        get: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
      expect(typeof sdk.AuthClient).toBe('function');
      expect(sdk.lockInternals.debug).toBe(false);
    });

    it(`${format} imports when the localStorage getter starts failing after a successful probe`, () => {
      const backend = storage('true');
      let reads = 0;
      const sdk = evaluate(source, {
        get: () => {
          reads += 1;
          if (reads > 3) throw new DOMException('access revoked', 'SecurityError');
          return backend;
        },
      });
      expect(backend.setItem).toHaveBeenCalled();
      expect(backend.removeItem).toHaveBeenCalled();
      expect(reads).toBeGreaterThan(3);
      expect(sdk.lockInternals.debug).toBe(false);
    });

    it(`${format} imports without browser storage`, () => {
      expect(evaluate(source, { value: undefined }).lockInternals.debug).toBe(false);
    });

    it.each([
      ['true', true],
      ['false', false],
      [null, false],
      ['TRUE', false],
    ])(`${format} preserves debug flag %s as %s`, (value, expected) => {
      const backend = storage(value);
      const sdk = evaluate(source, { value: backend });
      expect(sdk.lockInternals.debug).toBe(expected);
      expect(backend.getItem).toHaveBeenCalledWith('supabase.gotrue-js.locks.debug');
      expect(typeof sdk.navigatorLock).toBe('function');
      expect(typeof sdk.processLock).toBe('function');
    });

    it(`${format} retains the process lock callback result`, async () => {
      const sdk = evaluate(source, { value: storage(null) });
      const callback = vi.fn(async () => 'unchanged-result');
      await expect(sdk.processLock('storage-regression', -1, callback)).resolves.toBe(
        'unchanged-result',
      );
      expect(callback).toHaveBeenCalledOnce();
    });
  }

  it('installs a version-matched patch that changes only the two published lock files', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    const { version } = JSON.parse(readFileSync(path.join(authDirectory, 'package.json'), 'utf8'));
    const patch = readFileSync(
      path.join(root, 'patches', `@supabase+auth-js+${version}.patch`),
      'utf8',
    );
    expect(manifest.devDependencies['patch-package']).toBeUndefined();
    expect(manifest.scripts.postinstall).toBe('node scripts/apply-supabase-auth-patch.mjs');
    expect(patch.split('\n').filter((line) => line.startsWith('+++ b/'))).toEqual([
      '+++ b/node_modules/@supabase/auth-js/dist/main/lib/locks.js',
      '+++ b/node_modules/@supabase/auth-js/dist/module/lib/locks.js',
    ]);
  });
});
