import { randomInt } from 'node:crypto';

export const FIXED_TEST_ORDER_SEED = 20_260_801;
export const MAX_TEST_ORDER_SEED = 2_147_483_647;

export function parseTestOrderSeed(value) {
  if (!/^\d+$/.test(String(value ?? ''))) {
    throw new Error('A test-order seed must be a positive decimal integer.');
  }
  const seed = Number(value);
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > MAX_TEST_ORDER_SEED) {
    throw new Error(`A test-order seed must be between 1 and ${MAX_TEST_ORDER_SEED}.`);
  }
  return seed;
}

export function createTestOrderSeeds(
  input = '',
  draw = () => randomInt(1, MAX_TEST_ORDER_SEED + 1),
) {
  if (input.trim()) {
    const seeds = input.split(',').map((value) => parseTestOrderSeed(value.trim()));
    if (seeds.length > 8 || new Set(seeds).size !== seeds.length) {
      throw new Error('Specify at most eight distinct test-order seeds.');
    }
    return seeds;
  }

  const seeds = new Set();
  for (let attempt = 0; seeds.size < 3 && attempt < 128; attempt += 1) {
    const seed = parseTestOrderSeed(draw());
    if (seed !== FIXED_TEST_ORDER_SEED) seeds.add(seed);
  }
  if (seeds.size !== 3) throw new Error('Could not generate three distinct variable seeds.');
  return [...seeds];
}

export function createTestOrderRun(seedValue, filters = []) {
  const seed = parseTestOrderSeed(seedValue);
  if (filters.some((value) => !/^[\w./][\w./-]*$/.test(value))) {
    throw new Error('Only test file filters are accepted after the seed, not CLI options.');
  }
  return {
    seed,
    filters,
    args: [
      'run',
      '--sequence.shuffle',
      `--sequence.seed=${seed}`,
      '--no-file-parallelism',
      ...filters,
    ],
    reproduce: `npm run test:seed -- ${[seed, ...filters].join(' ')}`,
  };
}
