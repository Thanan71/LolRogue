# LolRogue

A League of Legends-themed roguelike built with **TypeScript, React and Vite**.

## Tech Stack

- **React 18** — UI, encounters and combat rendering
- **React Router** — Application navigation
- **Vite** — Build tool & dev server
- **Zustand** — Run and application state
- **Supabase** — Authentication and persistent progression
- **Vitest** — Testing framework

## Project Structure

```
src/
├── components/    # Shared React UI components
├── pages/         # React Router screens
├── game/          # Framework-independent game rules and engines
├── data/          # Runtime game data
├── services/      # Supabase repositories and application services
├── utils/         # Shared utility functions
└── stores/        # Zustand stores
data/
└── lol/           # League of Legends static data (champions, items, etc.)
assets/            # Sprites, sounds, images
tests/             # Test files
```

## Getting Started

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (port 3000)
npm run build      # Production build
npm test           # Run tests
npm run typecheck  # TypeScript type checking
```

## Supabase database

The complete PostgreSQL schema is defined by the single migration
`supabase/migrations/00000000000000_schema.sql`. It creates the game tables,
views, triggers and Row Level Security policies.

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The project does not send confirmation emails. Disable **Confirm email** in
the hosted Supabase Email provider settings. Local development already uses
`enable_confirmations = false` in `supabase/config.toml`.

Copy `.env.example` to `.env.local` and configure the browser client with
`VITE_PUBLIC_SUPABASE_URL` and `VITE_PUBLIC_SUPABASE_ANON_KEY`. Never expose
the service-role key through a `VITE_` variable.

The regular test suite checks the migration structure without credentials.
The database command below uses `@supabase/supabase-js` against the configured
Supabase project, creates isolated test data, verifies all tables, then removes
the test user and its cascaded data:

```bash
VITE_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co" \
VITE_PUBLIC_SUPABASE_ANON_KEY="YOUR_ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
npm run test:db
```

## Path Aliases

- `@/` → `src/`
- `@data/` → `data/`
- `@assets/` → `assets/`

## License

This project is licensed under the [MIT License](./LICENSE).

LolRogue is a non-commercial fan project inspired by League of Legends (© Riot Games).
League of Legends and all related assets are trademarks of Riot Games, Inc.
This project is not affiliated with or endorsed by Riot Games.
