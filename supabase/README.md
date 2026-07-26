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
supabase/migrations/20260723060000_atomic_mastery_enhancements.sql
supabase/migrations/20260723070000_run_loadout.sql
supabase/migrations/20260723080000_normalize_run_integer_payload.sql
supabase/migrations/20260723090000_server_authoritative_progression.sql
supabase/migrations/20260724090000_verified_run_attempts.sql
supabase/migrations/20260724190000_harden_verified_attempt_contract.sql
supabase/migrations/20260726090000_authoritative_daily_leaderboard.sql
supabase/migrations/20260726180000_minimize_public_data_and_harden_logs.sql
supabase/migrations/20260726210000_atomic_run_finalization.sql
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

Une base créée avec une ancienne version du fichier initial doit exécuter les
migrations horodatées dans l'ordre. Si l'ancien script a été lancé manuellement
dans le SQL Editor et n'apparaît pas dans l'historique de la CLI, appliquer
également les montées de version manuellement, une seule fois, puis réparer
l'historique avant le prochain `db push`. Ne jamais rejouer le schéma initial sur
une base contenant des données.

## Local validation and generated types

```bash
npm run db:start
npm run db:validate
npm run db:types
npm run edge:bundle
```

`db:validate` resets only the local LolRogue database, lints the PostgreSQL
schema and runs the live Auth/RLS/repository/attempt tests.
`src/types/database.ts` is generated from that local schema; application-specific
models live separately in `src/types/models.ts`.

`edge:bundle` génère le moteur déterministe consommé par `verify-run` et vérifie
que son hash correspond au ruleset SQL. Le fichier généré est volontairement
ignoré par Git : `edge:serve` et `edge:deploy` le reconstruisent toujours depuis
les sources versionnées.

Pour tester localement la fonction avec Supabase déjà démarré :

```bash
npm run edge:serve
```

Pour un projet hébergé, déployer la fonction avant la migration qui révoque
l'ancien chemin de sauvegarde, puis publier immédiatement le client compatible :

```bash
npm run edge:deploy
npm run migrate
```

La variable `SUPABASE_SERVICE_ROLE_KEY` est fournie au runtime de la fonction par
Supabase. Elle ne doit jamais être ajoutée aux variables `VITE_*`.

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

Database diagnostics are disabled by default. Set
`VITE_ENABLE_DB_LOGGING=true` only when authenticated client telemetry is
explicitly required; the server enforces attribution, quotas, sanitation and
14-day retention.
