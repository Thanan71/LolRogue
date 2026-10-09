/** Read callback intent before the Supabase SDK consumes the URL fragment. */
export function readPasswordRecoveryLocation(location: Pick<Location, 'search' | 'hash'>): {
  requested: boolean;
  failed: boolean;
} {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const requested = query.get('mode') === 'recovery' || hash.get('type') === 'recovery';
  return {
    requested,
    failed:
      requested &&
      Boolean(
        query.get('error') ||
          query.get('error_code') ||
          hash.get('error') ||
          hash.get('error_code'),
      ),
  };
}

export const initialPasswordRecovery =
  typeof window === 'undefined'
    ? { requested: false, failed: false }
    : readPasswordRecoveryLocation(window.location);
