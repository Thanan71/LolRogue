import { readFileSync, readdirSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseAuthRepository } from '@/services/repositories/SupabaseAuthRepository';
import { SupabaseLeaderboardRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import {
  SupabaseRunRepository,
  SupabaseRunStatsRepository,
} from '@/services/repositories/SupabaseRunRepository';
import type { Database } from '@/types/database';

const client = (value: unknown) => value as SupabaseClient<Database>;

describe('SupabaseAuthRepository behavior', () => {
  function setup() {
    const subscription = { unsubscribe: vi.fn() };
    const auth = {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription } }),
    };
    return { auth, subscription, repository: new SupabaseAuthRepository({ auth } as never) };
  }

  it('forwards signup metadata and canonicalizes sign-in data', async () => {
    const { auth, repository } = setup();
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 'token' } },
      error: null,
    });
    auth.signInWithPassword.mockResolvedValue({ data: null, error: undefined });

    await expect(
      repository.signUp('a@example.test', 'secret', { username: 'A' }),
    ).resolves.toMatchObject({
      user: { id: 'u1' },
      error: null,
    });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@example.test',
      password: 'secret',
      options: { data: { username: 'A' } },
    });
    await expect(repository.signIn('a@example.test', 'bad')).resolves.toEqual({
      user: null,
      session: null,
      error: null,
    });
  });

  it('surfaces sign-out errors and returns session/user truthfully', async () => {
    const { auth, repository } = setup();
    auth.signOut.mockResolvedValueOnce({ error: new Error('logout failed') });
    await expect(repository.signOut()).rejects.toThrow('logout failed');
    auth.signOut.mockResolvedValueOnce({ error: null });
    await expect(repository.signOut()).resolves.toBeUndefined();

    auth.getSession.mockResolvedValue({ data: { session: null }, error: new Error('expired') });
    await expect(repository.getSession()).resolves.toMatchObject({
      session: null,
      error: expect.any(Error),
    });
    auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    await expect(repository.getCurrentUser()).resolves.toMatchObject({ id: 'u1' });
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('offline') });
    await expect(repository.getCurrentUser()).resolves.toBeNull();
  });

  it('returns the exact auth subscription', () => {
    const { auth, subscription, repository } = setup();
    const callback = vi.fn();
    expect(repository.onAuthStateChange(callback)).toEqual({ subscription });
    expect(auth.onAuthStateChange).toHaveBeenCalledWith(callback);
  });
});

describe('SupabaseRunRepository behavior', () => {
  it('reads one run, paginated history and team members with narrow filters', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null });
    const range = vi.fn().mockResolvedValue({ data: [{ id: 'run-1' }], error: null });
    const teamEq = vi.fn().mockResolvedValue({ data: [{ run_id: 'run-1' }], error: null });
    const runEq = vi.fn().mockReturnValue({ single });
    const playerEq = vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({ range }),
    });
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({ eq: table === 'run_team_members' ? teamEq : runEq })),
    }));
    const repository = new SupabaseRunRepository(client({ from }));

    await expect(repository.getRun('run-1')).resolves.toMatchObject({ data: { id: 'run-1' } });
    // Replace the runs query with its paginated variant for this independent operation.
    from.mockReturnValueOnce({ select: vi.fn(() => ({ eq: playerEq })) } as never);
    await expect(repository.getPlayerRuns('player-1', 5, 10)).resolves.toMatchObject({
      data: [{ id: 'run-1' }],
    });
    expect(range).toHaveBeenCalledWith(10, 14);
    await expect(repository.getRunTeamMembers('run-1')).resolves.toMatchObject({
      data: [{ run_id: 'run-1' }],
    });
  });

  it('does not return stale data when any run query fails', async () => {
    const error = new Error('denied');
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error }) })),
      })),
    }));
    await expect(new SupabaseRunRepository(client({ from })).getRun('run-1')).resolves.toEqual({
      data: null,
      error,
    });
  });
});

describe('SupabaseRunStatsRepository behavior', () => {
  it('aggregates persisted rows and keeps the zero-run rate finite', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { won: true, run_level: 3, waves_completed: 5, total_kills: 4, total_damage_dealt: 100 },
        {
          won: false,
          run_level: 2,
          waves_completed: 2,
          total_kills: null,
          total_damage_dealt: null,
        },
      ],
      error: null,
    });
    const from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
    const repository = new SupabaseRunStatsRepository(client({ from }));
    await expect(repository.getPlayerRunStats('player-1')).resolves.toMatchObject({
      data: {
        totalRuns: 2,
        totalWins: 1,
        winRate: 50,
        totalWaves: 7,
        bestRunLevel: 3,
        totalKills: 4,
        totalDamage: 100,
      },
    });

    eq.mockResolvedValueOnce({ data: [], error: null });
    await expect(repository.getPlayerRunStats('new-player')).resolves.toMatchObject({
      data: { totalRuns: 0, winRate: 0, bestRunLevel: 0 },
    });
  });

  it('fails closed on aggregate errors and missing run details', async () => {
    const error = new Error('query failed');
    const aggregateEq = vi.fn().mockResolvedValue({ data: null, error });
    const aggregateClient = client({
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: aggregateEq })) })),
    });
    await expect(
      new SupabaseRunStatsRepository(aggregateClient).getPlayerRunStats('player-1'),
    ).resolves.toEqual({ data: null, error });

    const detailClient = client({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        })),
      })),
    });
    await expect(
      new SupabaseRunStatsRepository(detailClient).getRunDetails('missing'),
    ).resolves.toMatchObject({
      data: null,
      error: expect.any(Error),
    });
  });
});

describe('SupabaseLeaderboardRepository behavior', () => {
  it('gets the authenticated rank from the database without downloading the leaderboard', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 17, error: null });
    const from = vi.fn();
    const repository = new SupabaseLeaderboardRepository(client({ rpc, from }));

    await expect(repository.getPlayerRank()).resolves.toBe(17);
    expect(rpc).toHaveBeenCalledWith('get_my_leaderboard_rank');
    expect(from).not.toHaveBeenCalled();
  });
});

describe('critical repository type contracts', () => {
  it('forbids double assertions that can hide PostgREST response drift', () => {
    const repositoryDirectory = new URL('../src/services/repositories/', import.meta.url);
    const sources = readdirSync(repositoryDirectory)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(new URL(file, repositoryDirectory), 'utf8'));

    for (const source of sources) expect(source).not.toMatch(/as\s+unknown\s+as/);
  });
});
