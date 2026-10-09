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

  it('sends password recovery to the current app recovery form', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://lolrogue.example.test' } });
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    const updateUser = vi.fn().mockResolvedValue({ data: { user: { id: 'a' } }, error: null });
    const repository = new SupabaseAuthRepository({
      auth: { resetPasswordForEmail, updateUser },
    } as never);
    await expect(repository.requestPasswordReset('player@example.test')).resolves.toEqual({
      error: null,
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith('player@example.test', {
      redirectTo: 'https://lolrogue.example.test/auth?mode=recovery',
    });
    await repository.updatePassword({ password: 'new-secret' });
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-secret' });
  });
});
