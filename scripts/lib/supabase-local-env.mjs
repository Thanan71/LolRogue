export function parseSupabaseEnv(output) {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

export function resolveSupabaseTestEnv(values) {
  const storageOrigin = values.STORAGE_S3_URL?.match(/^(https?:\/\/[^/]+)/)?.[1];
  return {
    apiUrl: values.API_URL || values.SUPABASE_URL || storageOrigin || null,
    anonKey: values.ANON_KEY || values.PUBLISHABLE_KEY || null,
    serviceRoleKey: values.SERVICE_ROLE_KEY || values.SECRET_KEY || null,
  };
}

export function missingSupabaseTestEnv(values) {
  return Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
