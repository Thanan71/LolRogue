import {
  getSurvivingChampionIds,
  shouldApplyRunRewards,
} from '../src/game/run/runState';

describe('persisted run state helpers', () => {
  it('keeps champions with positive or not-yet-initialized HP alive', () => {
    expect(
      getSurvivingChampionIds([
        { championId: 'Garen', currentHp: 120 },
        { championId: 'Lux' },
      ]),
    ).toEqual(['Garen', 'Lux']);
  });

  it('does not mark KO champions as survivors', () => {
    expect(
      getSurvivingChampionIds([
        { championId: 'Garen', currentHp: 0 },
        { championId: 'Lux', currentHp: -10 },
        { championId: 'Ahri', currentHp: 1 },
      ]),
    ).toEqual(['Ahri']);
  });

  it('applies rewards only once, even when a save is retried', () => {
    expect(shouldApplyRunRewards(false, 2, 5)).toBe(true);
    expect(shouldApplyRunRewards(true, 2, 5)).toBe(false);
  });

  it('does not apply run rewards without a team or completed wave', () => {
    expect(shouldApplyRunRewards(false, 0, 5)).toBe(false);
    expect(shouldApplyRunRewards(false, 2, 0)).toBe(false);
  });
});
