# Database Logging System

This directory contains the centralized logging system for all database operations in the application.

## Architecture Overview

The logging system is designed following **SOLID principles** to ensure clean separation of concerns. All logs are stored in the database for persistent tracking and analysis.

### Key Features

- **Database Storage**: Logs are saved to the `logs` table in Supabase
- **Batch Processing**: Logs are batched for efficient database writes
- **Session Tracking**: Each session gets a unique ID for grouping related logs
- **Performance Tracking**: Automatic timing of all database operations
- **Error Tracking**: Full error details including stack traces
- **SOLID Architecture**: Clean separation between repositories and logging

### SOLID Principles Applied

1. **Single Responsibility Principle (SRP)**
   - Repositories focus solely on data access
   - Logging is handled by separate, dedicated components
   - No mixing of business logic and logging concerns

2. **Open/Closed Principle (OCP)**
   - Logging can be added/removed without modifying repository code
   - Uses Proxy pattern to wrap repositories transparently

3. **Liskov Substitution Principle (LSP)**
   - Logged repositories are drop-in replacements for plain repositories
   - Same interface, same behavior (plus logging)

4. **Interface Segregation Principle (ISP)**
   - Works with any repository interface
   - No forced dependencies on logging-specific interfaces

5. **Dependency Inversion Principle (DIP)**
   - High-level modules (services) depend on abstractions (interfaces)
   - Low-level modules (repositories) remain independent
   - Logging is applied at the composition root (factory)

## Database Schema

### Logs Table

```sql
CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(10) NOT NULL,
  repository VARCHAR(100) NOT NULL,
  method VARCHAR(100) NOT NULL,
  table_name VARCHAR(100),
  operation VARCHAR(20) NOT NULL,
  duration_ms NUMERIC(10,2),
  error_message TEXT,
  error_stack TEXT,
  details JSONB DEFAULT '{}',
  user_id UUID,
  player_id UUID,
  session_id UUID DEFAULT gen_random_uuid()
);
```

### Indexes

- `idx_logs_created_at` - For time-based queries
- `idx_logs_level` - For filtering by severity
- `idx_logs_repository` - For filtering by repository
- `idx_logs_operation` - For filtering by operation type
- `idx_logs_user_id` - For user-specific logs
- `idx_logs_player_id` - For player-specific logs
- `idx_logs_session_id` - For session grouping

## Files

- `dbLogger.ts` - Core logging utility with database storage and batch processing
- `RepositoryLogger.ts` - Decorator/wrapper that adds logging to any repository

## How It Works

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Repository    │    │ RepositoryLogger │    │   dbLogger      │
│   (Pure Data)   │◄───│   (Proxy/Wrapper)│◄───│   (Utility)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                        │
        └────────────────────────┴────────────────────────┘
                                │
                        ┌───────▼────────┐
                        │ createReposi   │
                        │ tories Factory │
                        └────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │   Supabase      │
                        │   (logs table)  │
                        └─────────────────┘
```

1. **Plain repositories** handle only data operations
2. **RepositoryLogger** wraps repositories using JavaScript Proxy
3. **dbLogger** batches and stores logs in the database
4. **Factory** (`createRepositories`) applies logging at instantiation

## Configuration

The logger can be configured via environment variables:

```env
# Enable/disable database operation logging (defaults to true in dev mode)
VITE_ENABLE_DB_LOGGING=true

# Log level: debug, info, warn, error (defaults to info)
VITE_DB_LOG_LEVEL=info
```

### Programmatic Configuration

```typescript
import { dbLogger } from '@/utils/dbLogger';

// Configure the logger
dbLogger.configure({
  enabled: true,
  minLevel: 'debug',
  logToDatabase: true,
  logToConsole: false,
  batchSize: 10,        // Flush every 10 logs
  batchInterval: 5000,  // Or every 5 seconds
  maxHistorySize: 1000,
});
```

## Usage

### Basic Usage (Automatic)

The factory automatically applies logging based on environment:

```typescript
import { createRepositories } from '@/services/repositories';
import { supabase } from '@/services/supabaseClient';

// Logging enabled in dev mode or when VITE_ENABLE_DB_LOGGING=true
const repos = createRepositories(supabase);

// Explicitly disable logging
const reposNoLog = createRepositories(supabase, false);
```

### Accessing Log History (Local Buffer)

```typescript
import { dbLogger } from '@/utils/dbLogger';

// Get all logs from local buffer
const allLogs = dbLogger.getHistory();

// Get logs filtered by repository
const authLogs = dbLogger.getHistory({ repository: 'SupabaseAuthRepository' });

// Get recent errors
const errors = dbLogger.getErrors(50);

// Get performance statistics
const stats = dbLogger.getPerformanceStats();
console.log(`Average operation time: ${stats.averageDuration.toFixed(2)}ms`);
console.log(`Total operations: ${stats.totalOperations}`);

// Clear local history
dbLogger.clearHistory();
```

### Querying Logs from Database

```typescript
import { supabase } from '@/services/supabaseClient';

// Get recent error logs
const { data: errors } = await supabase
  .from('logs')
  .select('*')
  .eq('level', 'error')
  .order('created_at', { ascending: false })
  .limit(50);

// Get logs for a specific repository
const { data: repoLogs } = await supabase
  .from('logs')
  .select('*')
  .eq('repository', 'SupabasePlayerRepository')
  .order('created_at', { ascending: false })
  .limit(100);

// Get logs for current session
const { data: sessionLogs } = await supabase
  .from('logs')
  .select('*')
  .eq('session_id', dbLogger.getSessionId())
  .order('created_at', { ascending: false });

// Get performance stats from database
const { data: stats } = await supabase
  .from('logs')
  .select('duration_ms, operation')
  .not('duration_ms', 'is', null);
```

## Log Levels

- **debug**: Detailed information for debugging (e.g., hasUnlock checks)
- **info**: General operational information (successful operations)
- **warn**: Warning conditions (non-critical errors that don't block operations)
- **error**: Error conditions (operations that failed)

## Performance Tracking

The logger automatically tracks the duration of each database operation using `performance.now()`. This helps identify:
- Slow database queries
- Network latency issues
- Performance regressions

Performance statistics can be retrieved using `dbLogger.getPerformanceStats()`.

## Batch Processing

Logs are batched for efficient database writes:

- **Batch Size**: Default 10 logs (configurable)
- **Batch Interval**: Default 5 seconds (configurable)
- **Auto-flush**: On page unload

This approach:
- Reduces database load
- Improves application performance
- Ensures logs are not lost on page close

## Benefits of This Architecture

### 1. Clean Separation
- Repositories remain focused on data access
- Logging logic is centralized and reusable
- Easy to test repositories without logging noise

### 2. Persistent Tracking
- Logs are stored in the database for later analysis
- Can query and analyze logs over time
- Session tracking for debugging user issues

### 3. Flexibility
- Enable/disable logging per environment
- Change logging behavior without touching repositories
- Easy to add new logging features

### 4. Maintainability
- Single source of truth for logging logic
- Consistent logging across all repositories
- Easy to debug and monitor

### 5. Testability
- Repositories can be tested in isolation
- Logging can be mocked or disabled in tests
- No side effects in repository code

## Production Considerations

In production, you may want to:

1. Set `VITE_DB_LOG_LEVEL=warn` to only log warnings and errors
2. Increase `batchSize` to reduce database writes
3. Implement log rotation/cleanup (migration includes 30-day cleanup)

Example for production:

```typescript
import { dbLogger } from '@/utils/dbLogger';

if (import.meta.env.PROD) {
  dbLogger.configure({
    enabled: import.meta.env.VITE_ENABLE_DB_LOGGING === 'true',
    minLevel: 'warn',
    logToConsole: false,
    batchSize: 50,      // Larger batches in production
    batchInterval: 10000, // Less frequent flushes
    maxHistorySize: 500,  // Smaller local buffer
  });
}
```

## Creating Custom Logged Repositories

If you need to create a custom repository with logging:

```typescript
import { createLoggedRepository } from '@/utils/RepositoryLogger';

// Create your plain repository
const myRepo = new MyCustomRepository(supabase);

// Wrap it with logging
const loggedRepo = createLoggedRepository(myRepo, 'MyCustomRepository');

// Use it normally - logging is automatic and stored in DB
await loggedRepo.someMethod();
```

## Troubleshooting

### No logs appearing in database
- Check `VITE_ENABLE_DB_LOGGING` is set to `true`
- Ensure the `logs` table exists (run migration 004)
- Check RLS policies allow insert
- Check browser console for errors

### Too many logs
- Increase `VITE_DB_LOG_LEVEL` (e.g., `warn` or `error`)
- Set `VITE_ENABLE_DB_LOGGING=false` in production

### Performance impact
- Logging adds minimal overhead (~1-2ms per operation)
- Batch processing reduces database load
- Disable in production if needed

### Logs not flushing
- Check network connectivity
- Check RLS policies
- Check `dbLogger.getBufferSize()` for pending logs