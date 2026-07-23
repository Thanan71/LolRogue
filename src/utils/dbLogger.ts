/**
 * Database Logger Utility
 *
 * Provides a centralized logging system for all database operations.
 * Logs are stored in the database for persistent tracking and analysis.
 * Supports different log levels, performance tracking, and batch processing.
 */

import { supabase } from '@/services/supabaseClient';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  repository: string;
  method: string;
  table?: string;
  operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'auth' | 'other';
  duration?: number;
  error?: Error | null;
  details?: Record<string, unknown>;
  userId?: string;
  playerId?: string;
}

export interface LogInsert {
  created_at: string;
  level: string;
  repository: string;
  method: string;
  table_name?: string;
  operation: string;
  duration_ms?: number;
  error_message?: string;
  error_stack?: string;
  details: Record<string, unknown>;
  user_id?: string;
  player_id?: string;
  session_id: string;
}

export interface LoggerConfig {
  enabled: boolean;
  minLevel: LogLevel;
  logToDatabase: boolean;
  logToConsole: boolean;
  batchSize: number;
  batchInterval: number;
  maxHistorySize: number;
}

class DatabaseLogger {
  private config: LoggerConfig;
  private history: LogEntry[] = [];
  private performanceTimers: Map<string, number> = new Map();
  private logBuffer: LogInsert[] = [];
  private sessionId: string;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;

  constructor(config?: Partial<LoggerConfig>) {
    this.sessionId = this.generateSessionId();
    this.config = {
      enabled: import.meta.env.DEV || import.meta.env.VITE_ENABLE_DB_LOGGING === 'true',
      minLevel: (import.meta.env.VITE_DB_LOG_LEVEL as LogLevel) || 'info',
      logToDatabase: true,
      logToConsole: false, // Disabled by default, logs go to DB
      batchSize: 10, // Flush every 10 logs
      batchInterval: 5000, // Or every 5 seconds
      maxHistorySize: 1000,
      ...config,
    };

    // Start batch flush timer
    this.startBatchTimer();
  }

  /**
   * Generate a unique session ID for grouping logs from the same session
   */
  private generateSessionId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart batch timer if interval changed
    if (config.batchInterval !== undefined) {
      this.startBatchTimer();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Start performance timing for an operation
   */
  startTimer(operationId: string): void {
    this.performanceTimers.set(operationId, performance.now());
  }

  /**
   * End performance timing and return duration in ms
   */
  endTimer(operationId: string): number | undefined {
    const startTime = this.performanceTimers.get(operationId);
    if (startTime === undefined) return undefined;

    const duration = performance.now() - startTime;
    this.performanceTimers.delete(operationId);
    return duration;
  }

  /**
   * Log a database operation
   */
  log(entry: Omit<LogEntry, 'timestamp'>): void {
    if (!this.config.enabled) return;

    const logEntry: LogEntry = {
      ...entry,
      timestamp: new Date(),
    };

    // Add to local history
    this.history.push(logEntry);
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }

    // Log to console if enabled
    if (this.config.logToConsole) {
      this.printToConsole(logEntry);
    }

    // Queue for database insertion
    if (this.config.logToDatabase) {
      this.queueForDatabase(logEntry);
    }

    // Special handling for errors
    if (logEntry.error) {
      console.error(`[DB Error] ${entry.repository}.${entry.method}:`, logEntry.error);
    }
  }

  /**
   * Queue a log entry for batch database insertion
   */
  private queueForDatabase(entry: LogEntry): void {
    const logInsert: LogInsert = {
      created_at: entry.timestamp.toISOString(),
      level: entry.level,
      repository: entry.repository,
      method: entry.method,
      table_name: entry.table,
      operation: entry.operation,
      duration_ms: entry.duration,
      error_message: entry.error?.message,
      error_stack: entry.error?.stack,
      details: entry.details || {},
      user_id: entry.userId,
      player_id: entry.playerId,
      session_id: this.sessionId,
    };

    this.logBuffer.push(logInsert);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.config.batchSize) {
      this.flushBuffer();
    }
  }

  /**
   * Check if user is authenticated
   */
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

  /**
   * Flush the log buffer to the database
   */
  async flushBuffer(): Promise<void> {
    if (this.isFlushing || this.logBuffer.length === 0) return;

    // Skip database insert if user is not authenticated
    const authenticated = await this.isAuthenticated();
    if (!authenticated) {
      // Clear buffer when not authenticated to prevent accumulation
      this.logBuffer = [];
      return;
    }

    this.isFlushing = true;

    try {
      const logsToInsert = [...this.logBuffer];
      this.logBuffer = [];

      const { error } = await supabase.from('logs').insert(logsToInsert);

      if (error) {
        console.error('[DB Logger] Failed to insert logs:', error);
        // Re-queue failed logs (up to 3 attempts)
        if (!error.message.includes('duplicate')) {
          this.logBuffer.unshift(...logsToInsert.slice(0, 5)); // Keep first 5
        }
      }
    } catch (error) {
      console.error('[DB Logger] Exception during flush:', error);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Start the batch flush timer
   */
  private startBatchTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flushBuffer();
    }, this.config.batchInterval);
  }

  /**
   * Log with info level
   */
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

  /**
   * Log with debug level
   */
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

  /**
   * Log with warn level
   */
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

  /**
   * Log an error
   */
  error(
    repository: string,
    method: string,
    error: Error | null,
    details?: Record<string, unknown>,
  ): void {
    this.log({
      level: 'error',
      repository,
      method,
      operation: 'other',
      error,
      details,
    });
  }

  /**
   * Get log history (from local buffer only)
   */
  getHistory(filter?: Partial<LogEntry>): LogEntry[] {
    if (!filter) return [...this.history];

    return this.history.filter((entry) => {
      for (const [key, value] of Object.entries(filter)) {
        if (entry[key as keyof LogEntry] !== value) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Get recent errors from local history
   */
  getErrors(limit = 50): LogEntry[] {
    return this.history.filter((entry) => entry.level === 'error' || entry.error).slice(-limit);
  }

  /**
   * Get performance statistics from local history
   */
  getPerformanceStats(): {
    averageDuration: number;
    slowestOperations: LogEntry[];
    totalOperations: number;
    operationsByType: Record<string, number>;
  } {
    const entriesWithDuration = this.history.filter((e) => e.duration !== undefined);
    const totalDuration = entriesWithDuration.reduce((sum, e) => sum + (e.duration || 0), 0);

    const operationsByType: Record<string, number> = {};
    this.history.forEach((entry) => {
      operationsByType[entry.operation] = (operationsByType[entry.operation] || 0) + 1;
    });

    return {
      averageDuration:
        entriesWithDuration.length > 0 ? totalDuration / entriesWithDuration.length : 0,
      slowestOperations: [...this.history]
        .filter((e) => e.duration !== undefined)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, 10),
      totalOperations: this.history.length,
      operationsByType,
    };
  }

  /**
   * Clear log history and buffer
   */
  clearHistory(): void {
    this.history = [];
    this.logBuffer = [];
    this.performanceTimers.clear();
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get buffer size (pending logs)
   */
  getBufferSize(): number {
    return this.logBuffer.length;
  }

  /**
   * Print log entry to console with formatting (if console logging enabled)
   */
  private printToConsole(entry: LogEntry): void {
    const time = entry.timestamp.toTimeString().split(' ')[0];
    const prefix = `[${time}] [${entry.level.toUpperCase()}] [${entry.repository}.${entry.method}]`;

    switch (entry.level) {
      case 'error':
        console.error(prefix, this.formatDetails(entry));
        break;
      case 'warn':
        console.warn(prefix, this.formatDetails(entry));
        break;
      case 'debug':
        console.debug(prefix, this.formatDetails(entry));
        break;
      default:
        console.log(prefix, this.formatDetails(entry));
    }
  }

  /**
   * Format log entry details for console output
   */
  private formatDetails(entry: LogEntry): string {
    const parts: string[] = [];

    if (entry.table) parts.push(`table: ${entry.table}`);
    if (entry.operation) parts.push(`op: ${entry.operation}`);
    if (entry.duration !== undefined) parts.push(`duration: ${entry.duration.toFixed(2)}ms`);
    if (entry.error) parts.push(`error: ${entry.error.message}`);
    if (entry.userId) parts.push(`user: ${entry.userId}`);
    if (entry.playerId) parts.push(`player: ${entry.playerId}`);

    if (entry.details) {
      const detailStr = JSON.stringify(entry.details);
      if (detailStr.length < 100) {
        parts.push(`details: ${detailStr}`);
      } else {
        parts.push(`details: ${detailStr.substring(0, 100)}...`);
      }
    }

    return parts.join(' | ');
  }

  /**
   * Destroy the logger and cleanup resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushBuffer();
  }
}

// Export singleton instance
export const dbLogger = new DatabaseLogger();

// Export class for testing or custom instances
export { DatabaseLogger };

// Auto-flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    dbLogger.destroy();
  });
}
