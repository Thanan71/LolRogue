import { describe, expect, it } from 'vitest';
import { createScopedRunRng } from '../src/utils/runRandom';

describe('scoped run randomness', () => {
  it('replays the same sequence for the same run seed and scope', () => {
    const first = createScopedRunRng(123456, 'event:event-4:outcome');
    const second = createScopedRunRng(123456, 'event:event-4:outcome');

    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next(),
    ]);
  });

  it('separates random streams by run seed and action scope', () => {
    const baseline = createScopedRunRng(123456, 'combat:node-2').next();

    expect(createScopedRunRng(654321, 'combat:node-2').next()).not.toBe(baseline);
    expect(createScopedRunRng(123456, 'combat:node-3').next()).not.toBe(baseline);
  });
});
