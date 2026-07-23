import { isFinalRunVictory } from '../src/game/battle/runOutcome';

describe('run outcome', () => {
  it('continues the run after a boss when another biome is available', () => {
    expect(isFinalRunVictory(true, true)).toBe(false);
  });

  it('ends the run as a victory after the final boss', () => {
    expect(isFinalRunVictory(true, false)).toBe(true);
  });

  it('does not end the run after a regular combat', () => {
    expect(isFinalRunVictory(false, false)).toBe(false);
  });
});
