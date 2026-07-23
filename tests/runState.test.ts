import { getSurvivingChampionIds } from '../src/game/run/runState';

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
});
