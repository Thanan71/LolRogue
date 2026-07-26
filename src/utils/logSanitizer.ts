const SENSITIVE_KEY =
  /(pass(word)?|token|secret|api.?key|authorization|cookie|credential|session|(user|player).?id)/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /bearer\s+[A-Z0-9._~+/=-]+/gi;
const JWT = /eyJ[A-Z0-9_-]+\.[A-Z0-9_-]+\.[A-Z0-9_-]+/gi;
const INLINE_SECRET = /(password|token|secret|api[_-]?key|credential)([=:])[^&\s]+/gi;

const MAX_DEPTH = 6;
const MAX_KEYS = 50;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 512;

export function sanitizeLogText(value: unknown, maxLength = MAX_STRING_LENGTH): string {
  const text = value instanceof Error ? value.message : String(value ?? '');
  return text
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(JWT, '[JWT]')
    .replace(EMAIL, '[EMAIL]')
    .replace(INLINE_SECRET, '$1$2[REDACTED]')
    .slice(0, Math.max(0, maxLength));
}

export function sanitizeLogValue(
  value: unknown,
  depth = 0,
  ancestors: WeakSet<object> = new WeakSet(),
): unknown {
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return typeof value === 'number' && !Number.isFinite(value) ? String(value) : value;
  }
  if (typeof value === 'string') return sanitizeLogText(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return '[UNSUPPORTED]';
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      message: sanitizeLogText(value.message, 1024),
      stack: sanitizeLogText(value.stack, 8192),
    };
  }
  if (typeof value !== 'object') return sanitizeLogText(value);
  if (ancestors.has(value)) return '[CIRCULAR]';

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitizeLogValue(item, depth + 1, ancestors));
    }

    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, MAX_KEYS)
        .map(([key, item]) => [
          key,
          SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeLogValue(item, depth + 1, ancestors),
        ]),
    );
  } finally {
    ancestors.delete(value);
  }
}

export function sanitizeLogDetails(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const sanitized = sanitizeLogValue(value ?? {});
  return sanitized !== null && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}
