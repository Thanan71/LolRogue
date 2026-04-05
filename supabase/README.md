# Supabase Database Setup Guide

This guide explains how to set up the player account database tables for LolRogue using Supabase.

## Overview

The database schema includes tables for:
- **Players**: Core account information linked to Supabase auth
- **Champion Mastery**: Per-champion progression tracking
- **Player Unlocks**: Unlocked starters and skins
- **Runs**: Completed run history
- **Run Team Members**: Champions used in each run with stats
- **Daily Runs**: Daily challenge runs and scores
- **Leaderboard**: Public player rankings view

## Prerequisites

1. A Supabase account and project
2. Your Supabase project URL and anon/service role keys
3. PostgreSQL client or access to Supabase SQL editor

## Setup Instructions

### Option 1: Using Supabase Dashboard (Recommended)

1. **Navigate to your Supabase project dashboard**
   - Go to https://supabase.com and select your project

2. **Open the SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Execute the migration**
   - Copy the entire content of `supabase/migrations/001_create_player_accounts.sql`
   - Paste it into the SQL editor
   - Click "Run" to execute

4. **Verify tables were created**
   - Go to "Table Editor" in the left sidebar
   - You should see all the new tables listed

### Option 2: Using Supabase CLI

1. **Install Supabase CLI** (if not already installed)
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**
   ```bash
   supabase login
   ```

3. **Initialize Supabase in your project** (if not already done)
   ```bash
   supabase init
   ```

4. **Link to your existing project**
   ```bash
   supabase link --project-ref curffughsmpukeprryaq
   ```

5. **Apply migrations**
   ```bash
   supabase db push
   ```

### Option 3: Direct PostgreSQL Connection

1. **Connect using psql or any PostgreSQL client**
   ```bash
   psql postgresql://postgres.curffughsmpukeprryaq:E4138Q3AJP8T9rRs@aws-1-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=require
   ```

2. **Execute the migration file**
   ```sql
   \i supabase/migrations/001_create_player_accounts.sql
   ```

## Environment Variables Setup

Create a `.env` file in your project root with the following variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://curffughsmpukeprryaq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1cmZmdWdoc21wdWtlcHJyeWFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTYxNjAsImV4cCI6MjA5MDkzMjE2MH0.GlEuBuYx3nULE9cQI-tNDovDZJWM_44oqNrMsdhAVJ0

# Service Role Key (Keep secret - server-side only)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1cmZmdWdoc21wdWtlcHJyeWFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM1NjE2MCwiZXhwIjoyMDkwOTMyMTYwfQ.lzd5NoFIru6yGUjKPnQT97cZVWPXEx_x1e4DbrmV9GU

# Database Connection (for backend services if needed)
DATABASE_URL=postgres://postgres.curffughsmpukeprryaq:E4138Q3AJP8T9rRs@aws-1-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=require
```

## Database Schema Details

### Players Table
```sql
CREATE TABLE players (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    username VARCHAR(50) UNIQUE,
    display_name VARCHAR(100),
    avatar_url TEXT,
    level INTEGER,
    total_candies INTEGER,
    total_runs_completed INTEGER,
    total_wins INTEGER,
    total_waves_completed INTEGER,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    last_login_at TIMESTAMP
);
```

### Champion Mastery Table
```sql
CREATE TABLE champion_mastery (
    id UUID PRIMARY KEY,
    player_id UUID REFERENCES players(id),
    champion_id VARCHAR(100),
    total_candies INTEGER,
    mastery_level INTEGER,
    current_level_candies INTEGER,
    unlocked_ids TEXT[],
    games_played INTEGER,
    games_won INTEGER,
    total_kills INTEGER,
    total_damage_dealt BIGINT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE(player_id, champion_id)
);
```

### Runs Table
```sql
CREATE TABLE runs (
    id UUID PRIMARY KEY,
    player_id UUID REFERENCES players(id),
    run_uuid VARCHAR(100) UNIQUE,
    won BOOLEAN,
    run_level INTEGER,
    waves_completed INTEGER,
    biomes_visited TEXT[],
    gold_earned INTEGER,
    total_kills INTEGER,
    total_damage_dealt BIGINT,
    candies_earned INTEGER,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,
    created_at TIMESTAMP
);
```

## Security Features

### Row Level Security (RLS)
All tables have RLS enabled with policies that ensure:
- Users can only access their own data
- Players can view and update their own profile
- Players can manage their own mastery and unlocks
- Run data is private to each player
- Leaderboard view is publicly accessible

### Automatic Triggers
- `update_updated_at_column`: Automatically updates timestamps
- `handle_new_user`: Creates player record on user signup
- `on_auth_user_created`: Links to Supabase auth system

## Usage Examples

### Insert a new run
```sql
INSERT INTO runs (player_id, run_uuid, won, run_level, waves_completed, biomes_visited, gold_earned, total_kills, total_damage_dealt, candies_earned, started_at, completed_at)
VALUES (
    'player-uuid-here',
    'run_1234567890_abc',
    true,
    5,
    25,
    ARRAY['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river'],
    1500,
    42,
    125000,
    35,
    NOW() - INTERVAL '30 minutes',
    NOW()
);
```

### Update champion mastery
```sql
INSERT INTO champion_mastery (player_id, champion_id, total_candies, mastery_level, current_level_candies, games_played, games_won, total_kills, total_damage_dealt)
VALUES (
    'player-uuid-here',
    'Ahri',
    150,
    2,
    100,
    10,
    6,
    120,
    450000
)
ON CONFLICT (player_id, champion_id) 
DO UPDATE SET
    total_candies = EXCLUDED.total_candies,
    mastery_level = EXCLUDED.mastery_level,
    current_level_candies = EXCLUDED.current_level_candies,
    games_played = champion_mastery.games_played + 1,
    games_won = champion_mastery.games_won + (CASE WHEN EXCLUDED.total_candies > 0 THEN 1 ELSE 0 END),
    total_kills = champion_mastery.total_kills + EXCLUDED.total_kills,
    total_damage_dealt = champion_mastery.total_damage_dealt + EXCLUDED.total_damage_dealt,
    updated_at = NOW();
```

### Query leaderboard
```sql
SELECT * FROM leaderboard LIMIT 10;
```

## Testing the Setup

1. **Create a test user** via Supabase auth
2. **Verify player record** was automatically created
3. **Test RLS policies** by trying to access other users' data (should fail)
4. **Insert test data** for runs and mastery
5. **Query the leaderboard** to ensure it's working

## Troubleshooting

### Migration fails with "relation already exists"
- The tables may already exist. Drop them first or modify the migration to use `DROP TABLE IF EXISTS` before creating.

### Permission denied errors
- Ensure you're using the correct credentials (service role key for full access)
- Check that RLS policies are properly configured

### Trigger errors
- Verify the `auth.users` table exists (it's created by Supabase auth)
- Check that the function permissions are correct

## Next Steps

1. **Create TypeScript types** for database models
2. **Set up Supabase client** in your React app
3. **Create API service layer** for database operations
4. **Implement authentication flow** with Supabase auth
5. **Add real-time updates** using Supabase subscriptions

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## Support

If you encounter issues:
1. Check the Supabase dashboard logs
2. Verify your connection string and credentials
3. Review the RLS policies in the dashboard
4. Consult the Supabase community Discord