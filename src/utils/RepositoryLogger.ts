/**
 * Repository Logger Wrapper
 *
 * Implements the Decorator pattern to add logging to any repository
 * without modifying the repository itself. This respects SOLID principles:
 * - Single Responsibility: Repositories focus on data, Logger handles logging
 * - Dependency Inversion: Works with any interface
 * - Open/Closed: Can add logging without modifying existing code
 */

import { dbLogger } from './dbLogger';

/**
 * Creates a logging wrapper around any repository instance.
 * The wrapper intercepts all method calls to add logging while
 * delegating actual work to the original repository.
 *
 * @param repository The original repository instance
 * @param repositoryName Name for logging purposes (e.g., 'SupabasePlayerRepository')
 * @returns A proxied repository with logging capabilities
 */
export function createLoggedRepository<T extends object>(repository: T, repositoryName: string): T {
  // Get all methods from the repository
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(repository)).filter(
    (prop) => typeof Reflect.get(repository, prop) === 'function' && prop !== 'constructor',
  );

  // Create a proxy that intercepts method calls
  const handler: ProxyHandler<T> = {
    get(target, prop, receiver) {
      const originalMethod = Reflect.get(target, prop, receiver);

      // If it's not a method we should log, return as-is
      if (!methods.includes(prop as string) || typeof originalMethod !== 'function') {
        return Reflect.get(target, prop, receiver);
      }

      // Return a wrapped version of the method
      return async function (...args: unknown[]) {
        const methodName = prop as string;
        const timerId = `${repositoryName}.${methodName}.${Date.now()}`;

        // Start timing
        dbLogger.startTimer(timerId);

        try {
          // Execute the original method
          const result = await (originalMethod as (...values: unknown[]) => unknown).apply(
            target,
            args,
          );

          // End timing
          const duration = dbLogger.endTimer(timerId);

          // Log success
          dbLogger.log({
            level: 'info',
            repository: repositoryName,
            method: methodName,
            operation: determineOperation(methodName, result),
            duration,
            details: extractLogDetails(methodName, args, result),
            userId: extractUserId(args, result),
            playerId: extractPlayerId(args, result),
          });

          return result;
        } catch (error) {
          // End timing on error
          const duration = dbLogger.endTimer(timerId);

          // Log error
          dbLogger.log({
            level: 'error',
            repository: repositoryName,
            method: methodName,
            operation: determineOperationFromName(methodName),
            duration,
            error: error instanceof Error ? error : new Error(String(error)),
            details: { arguments: sanitizeArgs(args) },
          });

          throw error;
        }
      };
    },
  };

  return new Proxy(repository, handler);
}

/**
 * Determines the database operation type from method name
 */
function determineOperation(
  methodName: string,
  _result: unknown,
): 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'auth' | 'other' {
  const lowerName = methodName.toLowerCase();

  if (lowerName.includes('get') || lowerName.includes('find') || lowerName.includes('has')) {
    return 'select';
  }
  if (lowerName.includes('create') || lowerName.includes('add') || lowerName.includes('signup')) {
    return 'insert';
  }
  if (lowerName.includes('update')) {
    return 'update';
  }
  if (lowerName.includes('upsert')) {
    return 'upsert';
  }
  if (
    lowerName.includes('delete') ||
    lowerName.includes('remove') ||
    lowerName.includes('signout')
  ) {
    return 'delete';
  }
  if (lowerName.includes('auth') || lowerName.includes('sign')) {
    return 'auth';
  }

  return 'other';
}

/**
 * Determines operation type from method name only (for error cases)
 */
function determineOperationFromName(
  methodName: string,
): 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'auth' | 'other' {
  const lowerName = methodName.toLowerCase();

  if (lowerName.includes('get') || lowerName.includes('find') || lowerName.includes('has')) {
    return 'select';
  }
  if (lowerName.includes('create') || lowerName.includes('add') || lowerName.includes('signup')) {
    return 'insert';
  }
  if (lowerName.includes('update')) {
    return 'update';
  }
  if (lowerName.includes('upsert')) {
    return 'upsert';
  }
  if (
    lowerName.includes('delete') ||
    lowerName.includes('remove') ||
    lowerName.includes('signout')
  ) {
    return 'delete';
  }
  if (lowerName.includes('auth') || lowerName.includes('sign')) {
    return 'auth';
  }

  return 'other';
}

/**
 * Extracts relevant details from method arguments and result for logging
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function extractLogDetails(
  methodName: string,
  args: unknown[],
  result: unknown,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  const lowerName = methodName.toLowerCase();

  // Add method-specific details
  if (lowerName.includes('getplayer') && args.length > 0) {
    details.playerId = args[0];
  }

  if (lowerName.includes('update') && args.length > 1) {
    details.updateKeys = Object.keys(asRecord(args[1]) ?? {});
  }

  if (lowerName.includes('create') && args.length > 0) {
    details.inputData = sanitizeArgs(args);
  }

  // Add result-specific details
  const resultRecord = asRecord(result);
  if (resultRecord) {
    if (resultRecord.error) {
      details.hasError = true;
    }
    if (resultRecord.data !== undefined) {
      if (Array.isArray(resultRecord.data)) {
        details.resultCount = resultRecord.data.length;
      } else if (resultRecord.data !== null) {
        details.hasResult = true;
      }
    }
  }

  return details;
}

/**
 * Validates if a string is a proper UUID format
 * UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Extracts user ID from arguments or result
 * Only returns proper UUIDs, not email addresses or other string formats
 */
function extractUserId(args: unknown[], result: unknown): string | undefined {
  const resultRecord = asRecord(result);
  const user = asRecord(resultRecord?.user);
  const session = asRecord(resultRecord?.session);
  const sessionUser = asRecord(session?.user);
  // Check result for user ID first (most reliable source)
  if (typeof user?.id === 'string' && isValidUUID(user.id)) {
    return user.id;
  }
  if (typeof sessionUser?.id === 'string' && isValidUUID(sessionUser.id)) {
    return sessionUser.id;
  }

  // Check if any argument is a valid UUID (skip emails and other formats)
  for (const arg of args) {
    if (typeof arg === 'string' && isValidUUID(arg)) {
      return arg;
    }
  }

  return undefined;
}

/**
 * Extracts player ID from arguments or result
 * Only returns valid UUIDs, not arbitrary strings
 */
function extractPlayerId(args: unknown[], result: unknown): string | undefined {
  const resultRecord = asRecord(result);
  const data = asRecord(resultRecord?.data);
  // Check result for player ID first (most reliable source)
  if (typeof data?.player_id === 'string' && isValidUUID(data.player_id)) {
    return data.player_id;
  }
  if (typeof data?.id === 'string' && isValidUUID(data.id) && !data.email) {
    return data.id;
  }

  // Check if any argument is a valid UUID (skip emails and other formats)
  for (const arg of args) {
    if (typeof arg === 'string' && isValidUUID(arg)) {
      return arg;
    }
  }

  return undefined;
}

/**
 * Sanitizes arguments for logging (removes sensitive data)
 */
function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === 'string' && arg.includes('@')) {
      return '[EMAIL]';
    }
    if (typeof arg === 'object' && arg !== null) {
      const sanitized = { ...(arg as Record<string, unknown>) };
      // Remove potential passwords
      delete sanitized.password;
      delete sanitized.confirmPassword;
      return sanitized;
    }
    return arg;
  });
}
