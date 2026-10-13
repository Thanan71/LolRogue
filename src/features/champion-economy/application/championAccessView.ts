import type { ChampionAccess } from '@/types/championEconomy';

export type ChampionAccessFilter = 'all' | 'available' | 'owned' | 'rotation' | 'locked';
export type ChampionAccessSort = 'name' | 'access';
export const accessOrder: Record<ChampionAccess, number> = {
  permanent_free: 0,
  owned: 1,
  weekly_rotation: 2,
  locked: 3,
};

export function championMatchesAccess(access: ChampionAccess, filter: ChampionAccessFilter) {
  return (
    filter === 'all' ||
    (filter === 'available'
      ? access !== 'locked'
      : filter === 'rotation'
        ? access === 'weekly_rotation'
        : access === filter)
  );
}
