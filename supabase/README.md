# Supabase setup

LolRogue uses a clean initialization migration:

```text
supabase/migrations/00000000000000_schema.sql
```

It creates the player, run, mastery, unlock, daily-run, enhancement and log
tables, plus the leaderboard/admin views, triggers and Row Level Security
policies.

The following non-destructive upgrade is provided for databases that executed
an older version of the initialization script:

```text
supabase/migrations/20260723000000_fix_signup_trigger.sql
supabase/migrations/20260723010000_harden_admin_access.sql
supabase/migrations/20260723020000_atomic_run_save.sql
supabase/migrations/20260723030000_grant_service_role.sql
supabase/migrations/20260723040000_daily_leaderboard_read.sql
supabase/migrations/20260723050000_atomic_daily_submission.sql
```

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

`supabase db push` applies only migrations that are not already recorded in the
remote migration history. The versioned upgrades preserve existing users and
application data. Reset only a disposable or new project; apply the upgrade
migrations to an existing production database.

It can also be copied directly into the hosted project's SQL Editor and run
once if the original initialization was executed manually.

## Local validation and generated types

```bash
npm run db:start
npm run db:validate
npm run db:types
```

`db:validate` resets only the local LolRogue database, lints the PostgreSQL
schema and runs the live Auth/RLS/repository tests. `src/types/database.ts` is
generated from that local schema; application-specific models live separately
in `src/types/models.ts`.

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
