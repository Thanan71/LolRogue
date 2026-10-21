import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
  setHeader: vi.fn(),
  abortSignal: vi.fn(),
}));

vi.mock('@/services/supabaseClient', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    rpc: (...args: unknown[]) => {
      const response = mocks.rpc(...args);
      return {
        setHeader: (name: string, value: string) => {
          mocks.setHeader(name, value);
          return {
            abortSignal: (signal: AbortSignal) => {
              mocks.abortSignal(signal);
              return response;
            },
          };
        },
      };
    },
  },
}));

import { DatabaseLogger } from '@/utils/dbLogger';

const sessionA = { user: { id: 'account-a' }, access_token: 'test-session-a' };
const sessionB = { user: { id: 'account-b' }, access_token: 'test-session-b' };

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
    mocks.getSession.mockReset().mockResolvedValue({ data: { session: sessionA } });
    mocks.rpc.mockReset().mockResolvedValue({ data: 1, error: null });
    mocks.setHeader.mockReset();
    mocks.abortSignal.mockReset();
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
          releaseSession = () => resolve({ data: { session: sessionA } });
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

  it('clears another account’s pending logs, history and diagnostic session identity', async () => {
    const logger = createLogger();
    const oldSession = logger.getSessionId();
    logger.info('Repository', 'accountA', 'old diagnostic');
    logger.resetSession();
    expect(logger.getBufferSize()).toBe(0);
    expect(logger.getHistory()).toEqual([]);
    expect(logger.getSessionId()).not.toBe(oldSession);

    mocks.getSession.mockResolvedValue({ data: { session: sessionB } });
    logger.info('Repository', 'accountB', 'new diagnostic');
    await logger.flushBuffer();

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls[0][1].p_logs).toHaveLength(1);
    expect(mocks.rpc.mock.calls[0][1].p_logs[0].method).toBe('accountB');
    expect(mocks.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer test-session-b');
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('test-session-b');
    logger.destroy();
  });

  it('ignores an old session lookup without consuming the next account’s buffer', async () => {
    let resolveSession: ((value: unknown) => void) | undefined;
    mocks.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        }),
    );
    const logger = createLogger();
    logger.info('Repository', 'accountA', 'old diagnostic');
    const oldFlush = logger.flushBuffer();
    logger.resetSession();
    logger.info('Repository', 'accountB', 'new diagnostic');
    resolveSession?.({ data: { session: sessionA } });
    await oldFlush;
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(logger.getBufferSize()).toBe(1);

    mocks.getSession.mockResolvedValue({ data: { session: sessionB } });
    await logger.flushBuffer();
    expect(mocks.rpc.mock.calls[0][1].p_logs[0].method).toBe('accountB');
    logger.destroy();
  });

  it('aborts an in-flight upload and prevents a late failure from restoring old logs', async () => {
    let rejectUpload: ((reason: Error) => void) | undefined;
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpload = reject;
        }),
    );
    const logger = createLogger();
    logger.info('Repository', 'accountA', 'old diagnostic');
    const upload = logger.flushBuffer();
    await vi.waitFor(() => expect(mocks.abortSignal).toHaveBeenCalledOnce());
    const signal = mocks.abortSignal.mock.calls[0][0];
    logger.resetSession();
    expect(signal.aborted).toBe(true);
    rejectUpload?.(new Error('Failed to fetch'));
    await upload;
    expect(logger.getBufferSize()).toBe(0);
    expect(logger.getHistory()).toEqual([]);
    expect(mocks.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer test-session-a');
    logger.destroy();
  });

  it('does not transmit when disabled or when the current session is absent or anonymous', async () => {
    const disabled = new DatabaseLogger({ enabled: false });
    disabled.info('Repository', 'method', 'disabled');
    await disabled.flushBuffer();
    expect(mocks.getSession).not.toHaveBeenCalled();
    disabled.destroy();

    for (const session of [null, { ...sessionA, user: { ...sessionA.user, is_anonymous: true } }]) {
      mocks.getSession.mockResolvedValue({ data: { session } });
      const logger = createLogger();
      logger.info('Repository', 'method', 'anonymous');
      await logger.flushBuffer();
      expect(logger.getBufferSize()).toBe(0);
      logger.destroy();
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
