# Database Logger Fix

## Problem Summary

The database logger was failing with two types of errors:

1. **UUID Format Error (22P02)**: `invalid input syntax for type uuid: "nathan.picot43@gmail.com"`
   - The logger was incorrectly extracting email addresses and passing them as `user_id` to the database
   - The `logs` table expects `user_id` to be a UUID, not an email address

2. **Authentication/RLS Error (42501)**: `new row violates row-level security policy for table "logs"`
   - The logger was attempting to insert logs even when the user was not authenticated
   - The `logs` table has RLS policies that require authentication for INSERT operations

## Changes Made

### 1. Fixed `src/utils/RepositoryLogger.ts`

**Problem**: The `extractUserId()` and `extractPlayerId()` functions were returning email addresses and arbitrary strings instead of valid UUIDs.

**Solution**: 
- Added `isValidUUID()` helper function to validate UUID format
- Modified `extractUserId()` to only return valid UUIDs from `result.user.id` or `result.session.user.id`
- Modified `extractPlayerId()` to only return valid UUIDs from `result.data.player_id` or `result.data.id`

```typescript
// New UUID validation function
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Updated extractUserId - only returns valid UUIDs
function extractUserId(args: any[], result: any): string | undefined {
  // Check result for user ID first (most reliable source)
  if (result?.user?.id && isValidUUID(result.user.id)) {
    return result.user.id;
  }
  if (result?.session?.user?.id && isValidUUID(result.session.user.id)) {
    return result.session.user.id;
  }
  
  // Check if any argument is a valid UUID (skip emails and other formats)
  for (const arg of args) {
    if (typeof arg === 'string' && isValidUUID(arg)) {
      return arg;
    }
  }
  
  return undefined;
}
```

### 2. Fixed `src/utils/dbLogger.ts`

**Problem**: The logger was attempting to insert logs into the database even when the user was not authenticated, causing 401 Unauthorized and RLS policy violation errors.

**Solution**: 
- Added `isAuthenticated()` method to check if the user has a valid session
- Modified `flushBuffer()` to skip database inserts when the user is not authenticated
- Clear the buffer when not authenticated to prevent log accumulation

```typescript
// New authentication check method
private async isAuthenticated(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session !== null;
  } catch {
    return false;
  }
}

// Updated flushBuffer - checks authentication before inserting
async flushBuffer(): Promise<void> {
  if (this.isFlushing || this.logBuffer.length === 0) return;

  // Skip database insert if user is not authenticated
  const authenticated = await this.isAuthenticated();
  if (!authenticated) {
    // Clear buffer when not authenticated to prevent accumulation
    this.logBuffer = [];
    return;
  }

  // ... rest of the flush logic
}
```

## Expected Behavior After Fix

1. **When user is not authenticated**:
   - Logs are still collected in local history (in-memory)
   - Database insert attempts are skipped
   - No 401 or RLS errors in the console

2. **When user is authenticated**:
   - Logs are inserted into the database with proper UUID format for `user_id` and `player_id`
   - No UUID format errors

3. **Local logging continues to work**:
   - The logger still maintains local history for debugging
   - Performance tracking still works
   - Console logging (if enabled) still works

## Testing

To test the fix:

1. Start the application without logging in
2. Open browser console - you should no longer see the 401/RLS errors
3. Log in to the application
4. Perform some actions that trigger database operations
5. Verify that logs are being inserted successfully (check Supabase dashboard)

## Notes

- The UUID validation uses a strict regex pattern that matches UUID v4 format
- The authentication check is performed on each flush (every 5 seconds by default)
- Local log history is maintained regardless of authentication status