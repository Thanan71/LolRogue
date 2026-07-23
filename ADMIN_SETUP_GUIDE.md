# Admin Panel Setup Guide

This guide explains how to set up and use the admin panel in LoL Rogue.

## Overview

The admin panel provides administrators with:
- **Dashboard**: Real-time statistics about the game (total players, active users, runs, etc.)
- **Logs Viewer**: Filterable view of database operation logs
- **Player Management**: View all players with their statistics
- **Run History**: View all runs (coming soon)

## Setup Instructions

### 1. Run the Database Migration

First, apply the admin migration to your Supabase database:

```bash
# Using the migration script
npm run migrate
```

The admin schema and policies are included in `supabase/migrations/00000000000000_schema.sql`.

This migration:
- Adds `is_admin` column to the `players` table
- Creates `admin_stats` view for dashboard statistics
- Creates `admin_player_stats` view for player management
- Sets up RLS policies to restrict admin access

### 2. Grant Admin Privileges

To make a user an admin, update their player record in Supabase:

```sql
-- Replace 'USER_UUID' with the actual user ID from auth.users
UPDATE public.players 
SET is_admin = TRUE 
WHERE user_id = 'USER_UUID';
```

You can find the user's UUID:
1. Go to Supabase Dashboard → Authentication → Users
2. Copy the User UID
3. Run the SQL command above

### 3. Access the Admin Panel

Once a user has admin privileges:
1. Log in to the application
2. The "Admin Panel" button will appear on the main menu (purple button with 🛡️ icon)
3. Click it to access the admin dashboard

## Security

### Row Level Security (RLS)

The admin system uses Supabase RLS policies to ensure:
- Only users with `is_admin = TRUE` can access admin views
- Admin data is protected at the database level
- The `is_current_user_admin()` function verifies admin status securely

### Route Protection

The `AdminRoute` component:
- Checks authentication status
- Verifies admin privileges
- Redirects non-admins to the main menu
- Shows "Access Denied" message during redirect

## Admin Panel Features

### Dashboard Tab
- **Total Players**: Number of registered players
- **Active Today**: Players who logged in today
- **Total Runs**: All completed runs
- **Daily Runs**: Daily challenge completions
- **Total Wins**: Sum of all victories
- **Total Candies Earned**: Sum of all candies

### Logs Tab
- Filter by log level (error, warn, info, debug)
- Filter by operation type (SELECT, INSERT, UPDATE, DELETE, etc.)
- Set result limit (50-1000 entries)
- View timestamps, repository, method, duration, and errors

### Players Tab
- View all players with detailed statistics
- See win rates, recent activity, and favorite champions
- Identify admins by the "ADMIN" badge
- Sortable table with key metrics

## Making Yourself Admin (Development)

For local development, you can make yourself admin:

1. Create an account or log in
2. Get your user ID from browser console:
   ```javascript
   // In browser console
   const user = supabase.auth.getUser();
   console.log(user?.data?.user?.id);
   ```
3. Run the SQL update command with your user ID

## Troubleshooting

### Admin button not showing
- Verify `is_admin` is set to `TRUE` in the database
- Refresh the page to reload auth state
- Check browser console for errors

### "Access Denied" when accessing /admin
- Confirm you're logged in
- Verify admin status in database
- Check RLS policies are applied correctly

### Stats not loading
- Ensure `admin_stats` view exists in database
- Check Supabase connection
- Verify RLS policies allow admin access

## Removing Admin Privileges

To remove admin access:

```sql
UPDATE public.players 
SET is_admin = FALSE 
WHERE user_id = 'USER_UUID';
```

## Database Views Reference

### admin_stats
Aggregated statistics view showing:
- `total_players`: Count of all players
- `active_today`: Players with today's login
- `total_runs`: Count of all runs
- `total_daily_runs`: Count of daily runs
- `total_wins`: Sum of all wins
- `total_candies_earned`: Sum of all candies

### admin_player_stats
Detailed player information including:
- Basic profile (username, display name, level)
- Game statistics (runs, wins, win rate, candies)
- Activity metrics (last login, recent runs)
- Admin status
- Favorite champion (most played)

## Best Practices

1. **Limit Admin Accounts**: Only grant admin to trusted users
2. **Monitor Logs**: Regularly check the logs tab for issues
3. **Respect Privacy**: Admin access should be used responsibly
4. **Backup Data**: Always have database backups before making changes

## Future Enhancements

Planned features:
- Run history with detailed filtering
- Player search and detailed player view
- Ban/suspend functionality
- Export statistics to CSV
- Real-time activity monitoring
- System health dashboard
