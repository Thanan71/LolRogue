# Supabase setup

LolRogue uses one database migration:

```text
supabase/migrations/00000000000000_init.sql
```

It creates the player, run, mastery, unlock, daily-run, enhancement and log
tables, plus the leaderboard/admin views, triggers and Row Level Security
policies.

## Fresh local database

```bash
supabase start
supabase db reset
```

## Fresh hosted project

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

This migration is intended for a clean database. If an older LolRogue schema
has already been deployed, reset the project database before applying it.

## Authentication without email messages

LolRogue uses email and password only as login credentials. It does not use
confirmation emails. Local Supabase configuration already sets:

```toml
[auth.email]
enable_confirmations = false
```

For a hosted project, also disable **Confirm email** in
Authentication → Providers → Email. New accounts must receive a session
immediately after signup.

## Environment

Copy `.env.example` to `.env.local` and provide:

```env
VITE_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is only used by live database tests. Never expose
it through a variable prefixed with `VITE_`.
