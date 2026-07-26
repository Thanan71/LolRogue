import { describe, expect, it } from 'vitest';
import { sanitizeLogDetails, sanitizeLogText, sanitizeLogValue } from '@/utils/logSanitizer';

describe('logSanitizer', () => {
  it('redacts nested sensitive keys and secrets embedded in strings', () => {
    const sanitized = sanitizeLogDetails({
      email: 'player@example.test',
      nested: {
        password: 'never-store-me',
        deeper: {
          authorization: 'Bearer abc.def.ghi',
          note: 'token=private-value',
        },
      },
    });

    expect(sanitized).toEqual({
      email: '[EMAIL]',
      nested: {
        deeper: {
          authorization: '[REDACTED]',
          note: 'token=[REDACTED]',
        },
        password: '[REDACTED]',
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain('never-store-me');
    expect(JSON.stringify(sanitized)).not.toContain('private-value');
  });

  it('bounds strings, arrays, depth and circular references', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const sanitized = sanitizeLogValue({
      circular,
      huge: 'x'.repeat(1_000),
      list: Array.from({ length: 30 }, (_, index) => index),
      deep: { one: { two: { three: { four: { five: 'secret' } } } } },
    }) as Record<string, unknown>;

    expect(sanitized.huge as string).toHaveLength(512);
    expect(sanitized.list).toHaveLength(20);
    expect(sanitized.circular).toEqual({ self: '[CIRCULAR]' });
    expect(JSON.stringify(sanitized)).toContain('[MAX_DEPTH]');
  });

  it('redacts error text before truncating it', () => {
    const result = sanitizeLogText(
      `Bearer abc123 player@example.test password=unsafe ${'x'.repeat(2_000)}`,
      100,
    );
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toContain('Bearer [REDACTED]');
    expect(result).toContain('[EMAIL]');
    expect(result).toContain('password=[REDACTED]');
    expect(result).not.toContain('unsafe');
  });
});
