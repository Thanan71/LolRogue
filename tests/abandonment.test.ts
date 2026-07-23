import { vi } from 'vitest';
import { confirmRunAbandonment } from '../src/game/run/abandonment';

describe('run abandonment', () => {
  it('does not prompt when there is no active run', () => {
    const confirm = vi.fn(() => false);
    expect(confirmRunAbandonment(false, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('continues only when the player confirms an active run abandonment', () => {
    expect(confirmRunAbandonment(true, () => true)).toBe(true);
    expect(confirmRunAbandonment(true, () => false)).toBe(false);
  });
});
