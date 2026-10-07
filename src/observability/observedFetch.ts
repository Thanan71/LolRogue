import { recordTechnicalMetric, technicalEndpoint } from './technicalMetrics';

/** Observe HTTP outcomes without reading or cloning response bodies. */
export function createObservedFetch(baseUrl: string, fetcher?: typeof fetch): typeof fetch {
  const origin = new URL(baseUrl).origin;
  return async (input, init) => {
    let route: { metric: 'auth' | 'postgrest'; endpoint: string } | null = null;
    try {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin === origin) {
        const match = /^\/(auth|rest)\/v1\/(?:rpc\/)?([^/]+)$/.exec(url.pathname);
        // Logging must not observe its own transport or it feeds itself forever.
        if (match && match[2] !== 'submit_client_logs' && match[2] !== 'logs') {
          route = {
            metric: match[1] === 'auth' ? 'auth' : 'postgrest',
            endpoint: technicalEndpoint(match[2] ?? ''),
          };
        }
      }
    } catch {
      /* Malformed/foreign URLs retain native fetch behavior. */
    }
    const record = (ok: boolean, code: 'ok' | 'http_4xx' | 'http_5xx' | 'network_error') => {
      if (!route) return;
      try {
        recordTechnicalMetric({ ...route, outcome: ok ? 'ok' : 'error', code });
        if (route.metric === 'postgrest' && route.endpoint === 'players') {
          recordTechnicalMetric({
            metric: 'profile',
            endpoint: 'players',
            outcome: ok ? 'ok' : 'error',
            code,
          });
        }
      } catch {
        // Instrumentation must never change an HTTP result or replace its error.
      }
    };
    try {
      // Match the SDK's default fetch resolver: use the current global implementation.
      const response = await (fetcher ? fetcher(input, init) : globalThis.fetch(input, init));
      record(response.ok, response.ok ? 'ok' : response.status >= 500 ? 'http_5xx' : 'http_4xx');
      return response;
    } catch (error) {
      record(false, 'network_error');
      throw error;
    }
  };
}
