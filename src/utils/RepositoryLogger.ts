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
export function createLoggedRepository<T extends object>(
  repository: T,
  repositoryName: string
): T {
  // Get all methods from the repository
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(repository))
    .filter(prop => typeof (repository as any)[prop] === 'function' && prop !== 'constructor');

  // Create a proxy that intercepts method calls
  const handler: ProxyHandler<T> = {
    get(target, prop, receiver) {
      const originalMethod = (target as any)[prop];
      
      // If it's not a method we should log, return as-is
      if (!methods.includes(prop as string) || typeof originalMethod !== 'function') {
        return Reflect.get(target, prop, receiver);
      }

      // Return a wrapped version of the method
      return async function (...args: any[]) {
        const methodName = prop as string;
        const timerId = `${repositoryName}.${methodName}.${Date.now()}`;
        
        // Start timing
        dbLogger.startTimer(timerId);

        try {
          // Execute the original method
          const result = await originalMethod.apply(target, args);
          
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
    }
  };

  return new Proxy(repository, handler);
}

/**
 * Determines the database operation type from method name
 */
function determineOperation(methodName: string, _result: any): 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'auth' | 'other' {
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
  if (lowerName.includes('delete') || lowerName.includes('remove') || lowerName.includes('signout')) {
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
function determineOperationFromName(methodName: string): 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'auth' | 'other' {
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
  if (lowerName.includes('delete') || lowerName.includes('remove') || lowerName.includes('signout')) {
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
function extractLogDetails(methodName: string, args: any[], result: any): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  const lowerName = methodName.toLowerCase();

  // Add method-specific details
  if (lowerName.includes('getplayer') && args.length > 0) {
    details.playerId = args[0];
  }
  
  if (lowerName.includes('update') && args.length > 1) {
    details.updateKeys = Object.keys(args[1] || {});
  }
  
  if (lowerName.includes('create') && args.length > 0) {
    details.inputData = sanitizeArgs(args);
  }

  // Add result-specific details
  if (result) {
    if (result.error) {
      details.hasError = true;
    }
    if (result.data !== undefined) {
      if (Array.isArray(result.data)) {
        details.resultCount = result.data.length;
      } else if (result.data !== null) {
        details.hasResult = true;
      }
    }
  }

  return details;
}

/**
 * Extracts user ID from arguments or result
 */
function extractUserId(args: any[], result: any): string | undefined {
  // Check if any argument looks like a user ID
  for (const arg of args) {
    if (typeof arg === 'string' && (arg.includes('@') || arg.startsWith('user-') || arg.length === 36)) {
      return arg;
    }
  }
  
  // Check result for user ID
  if (result?.user?.id) {
    return result.user.id;
  }
  if (result?.session?.user?.id) {
    return result.session.user.id;
  }
  
  return undefined;
}

/**
 * Extracts player ID from arguments or result
 */
function extractPlayerId(args: any[], result: any): string | undefined {
  // Common patterns for player ID in arguments
  for (const arg of args) {
    if (typeof arg === 'string' && !arg.includes('@') && arg.length > 10) {
      return arg;
    }
  }
  
  // Check result for player ID
  if (result?.data?.player_id) {
    return result.data.player_id;
  }
  if (result?.data?.id && !result?.data?.email) {
    return result.data.id;
  }
  
  return undefined;
}

/**
 * Sanitizes arguments for logging (removes sensitive data)
 */
function sanitizeArgs(args: any[]): any {
  return args.map(arg => {
    if (typeof arg === 'string' && arg.includes('@')) {
      return '[EMAIL]';
    }
    if (typeof arg === 'object' && arg !== null) {
      const sanitized = { ...arg };
      // Remove potential passwords
      delete sanitized.password;
      delete sanitized.confirmPassword;
      return sanitized;
    }
    return arg;
  });
}