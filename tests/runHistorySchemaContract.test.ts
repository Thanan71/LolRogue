import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseRunRepository } from '@/services/repositories/SupabaseRunRepository';
import type { Database } from '@/types/database';

describe('run history Supabase schema contract', () => {
  it('uses run_attempts.ruleset_version and maps it as the progression ruleset version', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.range.mockResolvedValue({
      data: [
        {
          id: 'run-v13',
          player_id: 'player-1',
          run_team_members: [],
          run_attempts: {
            difficulty: 'hard',
            mode: 'normal',
            engine_version: 'run-engine-v13',
            gameplay_ruleset_version: 13,
            ruleset_version: 2,
          },
        },
      ],
      error: null,
    });

    const supabase = {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient<Database>;

    const result = await new SupabaseRunRepository(supabase).getPlayerRunHistory('player-1');

    expect(query.select).toHaveBeenCalledTimes(1);
    const select = vi.mocked(query.select).mock.calls[0]?.[0];
    expect(select).toContain('gameplay_ruleset_version, ruleset_version');
    expect(select).not.toContain('progression_ruleset_version');
    expect(result.error).toBeNull();
    expect(result.data?.[0]?.attempt).toMatchObject({
      engineVersion: 'run-engine-v13',
      gameplayRulesetVersion: 13,
      progressionRulesetVersion: 2,
    });
  });
  it('filters parent rows using an inner attempt join only for authoritative filters', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
      returns: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.range.mockResolvedValue({ data: [], error: null });
    const supabase = { from: vi.fn(() => query) } as unknown as SupabaseClient<Database>;
    await new SupabaseRunRepository(supabase).getPlayerRunHistory('player-1', 20, 0, {
      outcome: 'defeat',
      difficulty: 'hard',
      mode: 'daily',
      engineVersion: 'run-engine-v21',
      gameplayRulesetVersion: 21,
      progressionRulesetVersion: 2,
    });
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('runs_run_attempt_id_fkey!inner('),
    );
    expect(query.eq.mock.calls).toEqual([
      ['player_id', 'player-1'],
      ['won', false],
      ['run_attempts.difficulty', 'hard'],
      ['run_attempts.mode', 'daily'],
      ['run_attempts.engine_version', 'run-engine-v21'],
      ['run_attempts.gameplay_ruleset_version', 21],
      ['run_attempts.ruleset_version', 2],
    ]);
    query.select.mockClear();
    await new SupabaseRunRepository(supabase).getPlayerRunHistory('player-1');
    expect(query.select.mock.calls[0][0]).not.toContain('!inner');
  });
});
