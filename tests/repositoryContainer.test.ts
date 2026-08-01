import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  RepositoryContainer,
  RepositoryContainerFactory,
} from '@/services/container/RepositoryContainer';
import type { Database } from '@/types/database';

const supabase = {} as SupabaseClient<Database>;

describe('RepositoryContainer orchestration', () => {
  it('lazily creates and caches every repository', () => {
    const container = new RepositoryContainer(supabase);
    const repositories = [
      container.auth,
      container.player,
      container.run,
      container.runStats,
      container.mastery,
      container.playerUnlock,
      container.dailyRun,
      container.leaderboard,
      container.enhancement,
    ];

    expect(repositories).toHaveLength(9);
    expect(container.auth).toBe(repositories[0]);
    expect(container.player).toBe(repositories[1]);
    expect(container.run).toBe(repositories[2]);
    expect(container.runStats).toBe(repositories[3]);
    expect(container.mastery).toBe(repositories[4]);
    expect(container.playerUnlock).toBe(repositories[5]);
    expect(container.dailyRun).toBe(repositories[6]);
    expect(container.leaderboard).toBe(repositories[7]);
    expect(container.enhancement).toBe(repositories[8]);
  });

  it('clears all cached instances without changing the client contract', () => {
    const container = new RepositoryContainer(supabase);
    const previous = {
      auth: container.auth,
      player: container.player,
      run: container.run,
      runStats: container.runStats,
      mastery: container.mastery,
      playerUnlock: container.playerUnlock,
      dailyRun: container.dailyRun,
      leaderboard: container.leaderboard,
      enhancement: container.enhancement,
    };

    container.clear();

    expect(container.auth).not.toBe(previous.auth);
    expect(container.player).not.toBe(previous.player);
    expect(container.run).not.toBe(previous.run);
    expect(container.runStats).not.toBe(previous.runStats);
    expect(container.mastery).not.toBe(previous.mastery);
    expect(container.playerUnlock).not.toBe(previous.playerUnlock);
    expect(container.dailyRun).not.toBe(previous.dailyRun);
    expect(container.leaderboard).not.toBe(previous.leaderboard);
    expect(container.enhancement).not.toBe(previous.enhancement);
  });

  it('supports logged proxies while retaining repository methods', () => {
    const container = RepositoryContainerFactory.create(supabase, { enableLogging: true });
    expect(typeof container.auth.signIn).toBe('function');
    expect(typeof container.run.getPlayerRuns).toBe('function');
    expect(typeof container.enhancement.unlockNode).toBe('function');
  });

  it('does not share repositories across independent composition roots', () => {
    const first = RepositoryContainerFactory.create(supabase);
    const second = RepositoryContainerFactory.create(supabase);
    expect(second).not.toBe(first);
    expect(second.run).not.toBe(first.run);
  });
});
