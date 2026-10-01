import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createTestOrderRun,
  createTestOrderSeeds,
  FIXED_TEST_ORDER_SEED,
  MAX_TEST_ORDER_SEED,
  parseTestOrderSeed,
} from '../scripts/lib/test-order-seeds.mjs';

describe('reproducible variable test-order seeds', () => {
  it.each([1, '1', '20260801', MAX_TEST_ORDER_SEED])('accepts the explicit seed %s', (seed) => {
    expect(parseTestOrderSeed(seed)).toBe(Number(seed));
  });

  it.each([undefined, null, '', ' ', 0, -1, 1.5, '1e3', '1;exit', 'NaN', 2_147_483_648])(
    'rejects the invalid seed %s before launching Vitest',
    (seed) => expect(() => parseTestOrderSeed(seed)).toThrow(),
  );

  it('keeps the existing fixed default in the main CI configuration', () => {
    const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
    expect(config).toMatch(/shuffle:\s*true/);
    expect(config).toContain('seed: 20_260_801');
    expect(FIXED_TEST_ORDER_SEED).toBe(20_260_801);
  });

  it('generates three distinct seeds, excluding the main fixed permutation', () => {
    const draws = [FIXED_TEST_ORDER_SEED, 12, 12, 34, 56];
    expect(createTestOrderSeeds('', () => draws.shift())).toEqual([12, 34, 56]);
    const seeds = createTestOrderSeeds();
    expect(new Set(seeds).size).toBe(3);
    expect(seeds).not.toContain(FIXED_TEST_ORDER_SEED);
    for (const seed of seeds) expect(parseTestOrderSeed(seed)).toBe(seed);
  });

  it('fails closed if a broken random source cannot produce distinct seeds', () => {
    expect(() => createTestOrderSeeds('', () => 1)).toThrow('three distinct');
  });

  it('replays explicit seeds exactly and bounds the manual matrix', () => {
    expect(createTestOrderSeeds('42, 99, 20260801')).toEqual([42, 99, 20260801]);
    expect(createTestOrderSeeds('42')).toEqual([42]);
    for (const input of ['1,1', '1,01', '1,', ',1', '1,2,3,4,5,6,7,8,9', '0']) {
      expect(() => createTestOrderSeeds(input)).toThrow();
    }
  });

  it('uses the real Vitest shuffle/seed API, with serial files and no skipped subset by default', () => {
    expect(createTestOrderRun('123')).toEqual({
      seed: 123,
      filters: [],
      args: ['run', '--sequence.shuffle', '--sequence.seed=123', '--no-file-parallelism'],
      reproduce: 'npm run test:seed -- 123',
    });
    expect(createTestOrderRun('123', ['tests/persistence.test.ts']).reproduce).toBe(
      'npm run test:seed -- 123 tests/persistence.test.ts',
    );
    expect(() => createTestOrderRun('123', ['--sequence.seed=456'])).toThrow('CLI options');
  });

  it('prints only machine-readable seed JSON for the workflow matrix', () => {
    const result = spawnSync(process.execPath, ['scripts/generate-test-order-seeds.mjs', '4,5,6'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([4, 5, 6]);
  });

  it('preserves the failing exit code, exact seed, commit and local reproduction command', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lolrogue-seed-contract-'));
    try {
      const result = spawnSync(
        process.execPath,
        ['scripts/run-test-seed.mjs', '321', 'no-matching-test-order-cli-fixture'],
        {
          encoding: 'utf8',
          env: { ...process.env, TEST_SEED_REPORT_DIRECTORY: directory },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('Test order seed: 321');
      expect(result.stderr).toContain('FAILED test order seed 321. Reproduce:');
      const report = JSON.parse(readFileSync(join(directory, '321.json'), 'utf8'));
      expect(report).toMatchObject({
        version: 1,
        seed: 321,
        status: 'failed',
        exitCode: 1,
        reproduce: 'npm run test:seed -- 321 no-matching-test-order-cli-fixture',
      });
      expect(report.commit).toMatch(/^[a-f0-9]{40}$/);
      expect(report.node).toBe(process.version);
      expect(Date.parse(report.finishedAt)).toBeGreaterThanOrEqual(Date.parse(report.startedAt));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 20_000);
});
