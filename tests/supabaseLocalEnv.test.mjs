import {
  missingSupabaseTestEnv,
  parseSupabaseEnv,
  resolveSupabaseTestEnv,
} from '../scripts/lib/supabase-local-env.mjs';

describe('local Supabase environment', () => {
  it('reads the legacy CLI contract', () => {
    const values = resolveSupabaseTestEnv(
      parseSupabaseEnv(
        'API_URL="http://127.0.0.1:54321"\nANON_KEY="anon"\nSERVICE_ROLE_KEY="service"',
      ),
    );

    expect(values).toEqual({
      apiUrl: 'http://127.0.0.1:54321',
      anonKey: 'anon',
      serviceRoleKey: 'service',
    });
    expect(missingSupabaseTestEnv(values)).toEqual([]);
  });

  it('supports new key names and derives the API origin from the storage URL', () => {
    const values = resolveSupabaseTestEnv(
      parseSupabaseEnv(
        'PUBLISHABLE_KEY="publishable"\nSECRET_KEY="secret"\nSTORAGE_S3_URL="http://127.0.0.1:55321/storage/v1/s3"',
      ),
    );

    expect(values).toEqual({
      apiUrl: 'http://127.0.0.1:55321',
      anonKey: 'publishable',
      serviceRoleKey: 'secret',
    });
  });

  it('reports every missing value', () => {
    expect(missingSupabaseTestEnv({ apiUrl: null, anonKey: 'anon', serviceRoleKey: null })).toEqual(
      ['apiUrl', 'serviceRoleKey'],
    );
  });
});
