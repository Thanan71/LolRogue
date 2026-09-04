import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseAuthRepository } from '@/services/repositories/SupabaseAuthRepository';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SupabaseAuthRepository confirmation redirect', () => {
  it('redirects signup confirmation to the current app origin', async () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'https://lol-rogue-git-dev-utsgenius-4957s-projects.vercel.app',
      },
    });

    const signUp = vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    const repository = new SupabaseAuthRepository({ auth: { signUp } } as never);

    await repository.signUp('player@example.test', 'secret');

    expect(signUp).toHaveBeenCalledWith({
      email: 'player@example.test',
      password: 'secret',
      options: {
        data: undefined,
        emailRedirectTo: 'https://lol-rogue-git-dev-utsgenius-4957s-projects.vercel.app/',
      },
    });
  });
});
