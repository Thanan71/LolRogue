-- Migration: Add Admin Roles and Permissions
-- Description: Adds admin role support to the player system and creates admin-specific policies

-- Add is_admin column to players table
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create index for admin lookups
CREATE INDEX IF NOT EXISTS idx_players_is_admin ON public.players(is_admin) WHERE is_admin = TRUE;

-- Create admin statistics view
CREATE OR REPLACE VIEW public.admin_stats AS
SELECT 
    'total_players' as stat_name,
    COUNT(*)::text as stat_value
FROM public.players
UNION ALL
SELECT 
    'total_runs' as stat_name,
    COUNT(*)::text as stat_value
FROM public.runs
UNION ALL
SELECT 
    'total_daily_runs' as stat_name,
    COUNT(*)::text as stat_value
FROM public.daily_runs
UNION ALL
SELECT 
    'active_today' as stat_name,
    COUNT(*)::text as stat_value
FROM public.players
WHERE DATE(last_login_at) = DATE(NOW())
UNION ALL
SELECT 
    'total_wins' as stat_name,
    SUM(total_wins)::text as stat_value
FROM public.players
UNION ALL
SELECT 
    'total_candies_earned' as stat_name,
    SUM(total_candies)::text as stat_value
FROM public.players;

-- Create detailed player stats view for admins
CREATE OR REPLACE VIEW public.admin_player_stats AS
SELECT 
    p.id,
    p.user_id,
    p.username,
    p.display_name,
    p.level,
    p.total_candies,
    p.total_runs_completed,
    p.total_wins,
    p.total_waves_completed,
    p.created_at,
    p.last_login_at,
    p.is_admin,
    CASE 
        WHEN p.total_runs_completed > 0 
        THEN ROUND((p.total_wins::DECIMAL / p.total_runs_completed::DECIMAL) * 100, 2)
        ELSE 0 
    END as win_rate,
    -- Recent activity (last 7 days)
    (SELECT COUNT(*) FROM public.runs r 
     WHERE r.player_id = p.id 
     AND r.created_at > NOW() - INTERVAL '7 days') as recent_runs,
    -- Favorite champion (most played)
    (SELECT cm.champion_id FROM public.champion_mastery cm 
     WHERE cm.player_id = p.id 
     ORDER BY cm.games_played DESC 
     LIMIT 1) as favorite_champion
FROM public.players p
ORDER BY p.created_at DESC;
-- Update RLS policies for admin access
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view all player data" ON public.players;
DROP POLICY IF EXISTS "Admins can view all runs" ON public.runs;
DROP POLICY IF EXISTS "Admins can view all daily runs" ON public.daily_runs;
DROP POLICY IF EXISTS "Admins can view all champion mastery" ON public.champion_mastery;

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.players 
        WHERE public.players.user_id = auth.uid() 
        AND public.players.is_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin policies for viewing all data
CREATE POLICY "Admins can view all player data"
    ON public.players FOR SELECT
    USING (auth.uid() = user_id OR is_current_user_admin());

CREATE POLICY "Admins can view all runs"
    ON public.runs FOR SELECT
    USING (
        auth.uid() = player_id 
        OR is_current_user_admin()
    );

CREATE POLICY "Admins can view all daily runs"
    ON public.daily_runs FOR SELECT
    USING (
        auth.uid() = player_id 
        OR is_current_user_admin()
    );

CREATE POLICY "Admins can view all champion mastery"
    ON public.champion_mastery FOR SELECT
    USING (
        auth.uid() = player_id 
        OR is_current_user_admin()
    );

-- Grant permissions on views (views inherit RLS from base tables)
GRANT SELECT ON public.admin_stats TO authenticated;
GRANT SELECT ON public.admin_player_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- Add comments
COMMENT ON COLUMN public.players.is_admin IS 'Indicates if the player has admin privileges';
COMMENT ON VIEW public.admin_stats IS 'Aggregated statistics for admin dashboard';
COMMENT ON VIEW public.admin_player_stats IS 'Detailed player statistics for admin management';
COMMENT ON FUNCTION public.is_current_user_admin() IS 'Checks if the current authenticated user is an admin';