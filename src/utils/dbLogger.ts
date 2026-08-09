/**
 * Opt-in, bounded database diagnostics.
 *
 * The browser deliberately sends no user or player identity. The database RPC
 * derives both from auth.uid(), sanitizes the payload again and applies quotas.
 */

import { supabase } from '@/services/supabaseClient';
import type { Json } from '@/types/database';
import { sanitizeLogDetails, sanitizeLogText } from './logSanitizer';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogOperation = 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'auth' | 'other';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  repository: string;
  method: string;
  table?: string;
  operation: LogOperation;
  duration?: number;
  error?: Error | null;
  details?: Record<string, unknown>;
}

interface ClientLogPayload {
  [key: string]: Json | undefined;
  level: LogLevel;
  repository: string;
  method: string;
  table_name?: string;
  operation: LogOperation;
  duration_ms?: number;
  error_message?: string;
  error_stack?: string;
  details: Json;
  session_id: string;
}

interface BufferedLog {
  payload: ClientLogPayload;
  attempts: number;
}

export interface LoggerConfig {
  enabled: boolean;
  minLevel: LogLevel;
  logToDatabase: boolean;
  logToConsole: boolean;
  batchSize: number;
  batchInterval: number;
  maxHistorySize: number;
  maxBufferSize: number;
  maxRetries: number;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class DatabaseLogger {
  private config: LoggerConfig;
  private history: LogEntry[] = [];
  private performanceTimers = new Map<string, number>();
  private logBuffer: BufferedLog[] = [];
  private readonly sessionId: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;

  constructor(config?: Partial<LoggerConfig>) {
    this.sessionId = crypto.randomUUID();
    this.config = {
      enabled: import.meta.env.VITE_ENABLE_DB_LOGGING === 'true',
      minLevel: (import.meta.env.VITE_DB_LOG_LEVEL as LogLevel) || 'info',
      logToDatabase: true,
      logToConsole: false,
      batchSize: 10,
      batchInterval: 5000,
      maxHistorySize: 1000,
      maxBufferSize: 100,
      maxRetries: 2,
      ...config,
    };
    if (!(this.config.minLevel in LEVEL_PRIORITY)) this.config.minLevel = 'info';
    this.startBatchTimer();
  }

  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.enabled === false || config.logToDatabase === false) this.logBuffer = [];
    this.logBuffer = this.logBuffer.slice(-this.config.maxBufferSize);
    this.startBatchTimer();
  }

  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  startTimer(operationId: string): void {
    this.performanceTimers.set(operationId, performance.now());
  }

  endTimer(operationId: string): number | undefined {
    const startTime = this.performanceTimers.get(operationId);
    if (startTime === undefined) return undefined;
    this.performanceTimers.delete(operationId);
    return performance.now() - startTime;
  }

  log(entry: Omit<LogEntry, 'timestamp'>): void {
    if (
      !this.config.enabled ||
      LEVEL_PRIORITY[entry.level] < LEVEL_PRIORITY[this.config.minLevel]
    ) {
      return;
    }

    const error = entry.error
      ? Object.assign(new Error(sanitizeLogText(entry.error.message, 1024)), {
          stack: sanitizeLogText(entry.error.stack, 8192),
        })
      : entry.error;
    const logEntry: LogEntry = {
      ...entry,
      repository: sanitizeLogText(entry.repository, 100),
      method: sanitizeLogText(entry.method, 100),
      table: entry.table ? sanitizeLogText(entry.table, 100) : undefined,
      duration:
        entry.duration === undefined ? undefined : Math.min(3_600_000, Math.max(0, entry.duration)),
      error,
      details: sanitizeLogDetails(entry.details),
      timestamp: new Date(),
    };

    this.history.push(logEntry);
    this.history = this.history.slice(-this.config.maxHistorySize);

    if (this.config.logToConsole) this.printToConsole(logEntry);
    if (this.config.logToDatabase) this.queueForDatabase(logEntry);
  }

  private queueForDatabase(entry: LogEntry): void {
    const payload: ClientLogPayload = {
      level: entry.level,
      repository: entry.repository,
      method: entry.method,
      table_name: entry.table,
      operation: entry.operation,
      duration_ms: entry.duration,
      error_message: entry.error?.message,
      error_stack: entry.error?.stack,
      details: entry.details as Json,
      session_id: this.sessionId,
    };

    this.logBuffer.push({ payload, attempts: 0 });
    this.logBuffer = this.logBuffer.slice(-this.config.maxBufferSize);
    if (this.logBuffer.length >= this.config.batchSize) void this.flushBuffer();
  }

  private async isAuthenticated(): Promise<boolean> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session !== null;
    } catch {
      return false;
    }
  }

  async flushBuffer(): Promise<void> {
    if (this.isFlushing || this.logBuffer.length === 0 || !this.config.enabled) return;

    this.isFlushing = true;
    let logsToSend: BufferedLog[] = [];
    try {
      if (!(await this.isAuthenticated())) {
        this.logBuffer = [];
        return;
      }
      logsToSend = this.logBuffer.splice(0, Math.min(this.config.batchSize, 10));
      if (logsToSend.length === 0) return;
      const { error } = await supabase.rpc('submit_client_logs', {
        p_logs: logsToSend.map(({ payload }) => payload),
      });
      if (error) this.retryIfTransient(logsToSend, error.message);
    } catch (error) {
      if (logsToSend.length > 0) {
        this.retryIfTransient(logsToSend, error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private retryIfTransient(logs: BufferedLog[], message: string): void {
    if (!/(network|fetch|timeout|connection|temporar|offline)/i.test(message)) return;
    const retryable = logs
      .map((log) => ({ ...log, attempts: log.attempts + 1 }))
      .filter((log) => log.attempts <= this.config.maxRetries);
    this.logBuffer = [...retryable, ...this.logBuffer].slice(-this.config.maxBufferSize);
  }

  private startBatchTimer(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    if (!this.config.enabled || !this.config.logToDatabase) return;
    this.flushTimer = setInterval(() => void this.flushBuffer(), this.config.batchInterval);
  }

  info(
    repository: string,
    method: string,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    this.log({
      level: 'info',
      repository,
      method,
      operation: 'other',
      details: { message, ...details },
    });
  }

  debug(
    repository: string,
    method: string,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    this.log({
      level: 'debug',
      repository,
      method,
      operation: 'other',
      details: { message, ...details },
    });
  }

  warn(
    repository: string,
    method: string,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    this.log({
      level: 'warn',
      repository,
      method,
      operation: 'other',
      details: { message, ...details },
    });
  }

  error(
    repository: string,
    method: string,
    error: Error | null,
    details?: Record<string, unknown>,
  ): void {
    this.log({ level: 'error', repository, method, operation: 'other', error, details });
  }

  getHistory(filter?: Partial<LogEntry>): LogEntry[] {
    if (!filter) return [...this.history];
    return this.history.filter((entry) =>
      Object.entries(filter).every(([key, value]) => entry[key as keyof LogEntry] === value),
    );
  }

  getErrors(limit = 50): LogEntry[] {
    return this.history.filter((entry) => entry.level === 'error' || entry.error).slice(-limit);
  }

  getPerformanceStats(): {
    averageDuration: number;
    slowestOperations: LogEntry[];
    totalOperations: number;
    operationsByType: Record<string, number>;
  } {
    const timed = this.history.filter((entry) => entry.duration !== undefined);
    const operationsByType: Record<string, number> = {};
    for (const entry of this.history) {
      operationsByType[entry.operation] = (operationsByType[entry.operation] || 0) + 1;
    }
    return {
      averageDuration:
        timed.length > 0
          ? timed.reduce((sum, entry) => sum + (entry.duration || 0), 0) / timed.length
          : 0,
      slowestOperations: [...timed]
        .sort((left, right) => (right.duration || 0) - (left.duration || 0))
        .slice(0, 10),
      totalOperations: this.history.length,
      operationsByType,
    };
  }

  clearHistory(): void {
    this.history = [];
    this.logBuffer = [];
    this.performanceTimers.clear();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getBufferSize(): number {
    return this.logBuffer.length;
  }

  private printToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp.toTimeString().split(' ')[0]}] [${entry.level.toUpperCase()}] [${entry.repository}.${entry.method}]`;
    const details = this.formatDetails(entry);
    if (entry.level === 'error') console.error(prefix, details);
    else if (entry.level === 'warn') console.warn(prefix, details);
    else if (entry.level === 'debug') console.debug(prefix, details);
    else console.log(prefix, details);
  }

  private formatDetails(entry: LogEntry): string {
    const parts: string[] = [];
    if (entry.table) parts.push(`table: ${entry.table}`);
    parts.push(`op: ${entry.operation}`);
    if (entry.duration !== undefined) parts.push(`duration: ${entry.duration.toFixed(2)}ms`);
    if (entry.error) parts.push(`error: ${entry.error.message}`);
    if (entry.details) parts.push(`details: ${JSON.stringify(entry.details).slice(0, 100)}`);
    return parts.join(' | ');
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    void this.flushBuffer();
  }
}

export const dbLogger = new DatabaseLogger();
export { DatabaseLogger };

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => dbLogger.destroy());
}
