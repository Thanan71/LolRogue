-- Create logs table for database operation tracking
CREATE TABLE IF NOT EXISTS public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  repository VARCHAR(100) NOT NULL,
  method VARCHAR(100) NOT NULL,
  table_name VARCHAR(100),
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('select', 'insert', 'update', 'upsert', 'delete', 'auth', 'other')),
  duration_ms NUMERIC(10,2),
  error_message TEXT,
  error_stack TEXT,
  details JSONB DEFAULT '{}',
  user_id UUID,
  player_id UUID,
  session_id UUID DEFAULT gen_random_uuid()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON public.logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON public.logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_repository ON public.logs(repository);
CREATE INDEX IF NOT EXISTS idx_logs_operation ON public.logs(operation);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON public.logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_player_id ON public.logs(player_id);
CREATE INDEX IF NOT EXISTS idx_logs_session_id ON public.logs(session_id);

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_logs_repository_method ON public.logs(repository, method);
CREATE INDEX IF NOT EXISTS idx_logs_created_at_level ON public.logs(created_at DESC, level);

-- Enable Row Level Security
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to insert logs
CREATE POLICY "Authenticated users can insert logs" ON public.logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policy to allow authenticated users to view their own logs
CREATE POLICY "Users can view their own logs" ON public.logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.players 
      WHERE public.players.user_id = auth.uid() 
      AND public.players.level >= 10 -- Admin check based on player level (adjust as needed)
    )
  );

-- Create policy to allow admins to delete old logs (for maintenance)
CREATE POLICY "Admins can delete logs" ON public.logs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players 
      WHERE public.players.user_id = auth.uid() 
      AND public.players.level >= 10 -- Admin check based on player level (adjust as needed)
    )
  );

-- Function to automatically clean up old logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.logs 
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND level != 'error'; -- Keep error logs longer if needed
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the cleanup function
GRANT EXECUTE ON FUNCTION cleanup_old_logs() TO authenticated;

-- Add a comment to the table
COMMENT ON TABLE public.logs IS 'Stores database operation logs for monitoring and debugging';
COMMENT ON COLUMN public.logs.level IS 'Log severity level: debug, info, warn, error';
COMMENT ON COLUMN public.logs.operation IS 'Type of database operation: select, insert, update, upsert, delete, auth, other';
COMMENT ON COLUMN public.logs.duration_ms IS 'Operation duration in milliseconds';
COMMENT ON COLUMN public.logs.details IS 'Additional context about the operation in JSON format';