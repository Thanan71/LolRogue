import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/services/supabaseClient', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    rpc: mocks.rpc,
  },
}));

import { DatabaseLogger } from '@/utils/dbLogger';

function createLogger(maxRetries = 2) {
  return new DatabaseLogger({
    enabled: true,
    minLevel: 'debug',
    logToDatabase: true,
    logToConsole: false,
    batchSize: 10,
    batchInterval: 60_000,
    maxHistorySize: 20,
    maxBufferSize: 20,
    maxRetries,
  });
}

describe('DatabaseLogger', () => {
  beforeEach(() => {
    mocks.getSession.mockReset().mockResolvedValue({ data: { session: { user: {} } } });
    mocks.rpc.mockReset().mockResolvedValue({ data: 1, error: null });
  });

  it('sends a recursively sanitized payload without caller-controlled identity', async () => {
    const logger = createLogger();
    logger.log({
      level: 'error',
      repository: 'PlayerRepository',
      method: 'save',
      operation: 'update',
      error: new Error('Bearer abc player@example.test'),
      details: {
        userId: 'forged-user',
        nested: { password: 'unsafe', message: 'token=unsafe-too' },
      },
    });

    await logger.flushBuffer();

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('submit_client_logs', {
      p_logs: [
        expect.objectContaining({
          repository: 'PlayerRepository',
          error_message: 'Bearer [REDACTED] [EMAIL]',
          details: {
            nested: { message: 'token=[REDACTED]', password: '[REDACTED]' },
            userId: '[REDACTED]',
          },
        }),
      ],
    });
    const payload = mocks.rpc.mock.calls[0][1].p_logs[0];
    expect(payload).not.toHaveProperty('user_id');
    expect(payload).not.toHaveProperty('player_id');
    expect(payload).not.toHaveProperty('created_at');
    expect(JSON.stringify(payload)).not.toContain('forged-user');
    logger.clearHistory();
    logger.destroy();
  });

  it('retries transient failures only up to the configured maximum', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    const logger = createLogger(2);
    logger.info('PlayerRepository', 'getPlayer', 'network test');

    await logger.flushBuffer();
    expect(logger.getBufferSize()).toBe(1);
    await logger.flushBuffer();
    expect(logger.getBufferSize()).toBe(1);
    await logger.flushBuffer();

    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(logger.getBufferSize()).toBe(0);
    logger.destroy();
  });

  it('drops quota and validation errors without retrying them', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'log_rate_limit_exceeded' } });
    const logger = createLogger();
    logger.info('PlayerRepository', 'getPlayer', 'quota test');

    await logger.flushBuffer();
    await logger.flushBuffer();

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(logger.getBufferSize()).toBe(0);
    logger.destroy();
  });

  it('serializes concurrent flush requests into one batch', async () => {
    let releaseSession: (() => void) | undefined;
    mocks.getSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSession = () => resolve({ data: { session: { user: {} } } });
        }),
    );
    const logger = createLogger();
    logger.info('PlayerRepository', 'getPlayer', 'concurrency test');

    const firstFlush = logger.flushBuffer();
    const secondFlush = logger.flushBuffer();
    releaseSession?.();
    await Promise.all([firstFlush, secondFlush]);

    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledOnce();
    logger.destroy();
  });

  it('caps the pending client buffer', () => {
    const logger = new DatabaseLogger({
      enabled: true,
      minLevel: 'debug',
      logToDatabase: true,
      logToConsole: false,
      batchSize: 10,
      batchInterval: 60_000,
      maxHistorySize: 20,
      maxBufferSize: 3,
      maxRetries: 0,
    });
    for (let index = 0; index < 5; index += 1) {
      logger.info('Repository', 'method', `message ${index}`);
    }
    expect(logger.getBufferSize()).toBe(3);
    logger.clearHistory();
    logger.destroy();
  });
});
