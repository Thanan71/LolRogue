# LolRogue

A roguelike game built with **TypeScript + React + Vite + Phaser 3**, themed around League of Legends.

## Tech Stack

- **React 18** — UI layer (menus, HUD)
- **Phaser 3** — Game engine (combat, world rendering)
- **Vite** — Build tool & dev server
- **Zustand** — Lightweight state management
- **Vitest** — Testing framework

## Project Structure

```
src/
├── components/    # React UI components
├── game/          # Phaser scenes & game logic
│   └── scenes/    # Phaser Scene classes
├── data/          # Runtime game data
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

The initial PostgreSQL migration is located in
`supabase/migrations/20260723190000_initial_schema.sql`. It references Supabase
Auth, creates the game tables, enables Row Level Security, and installs the
profile creation trigger.

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Copy `.env.example` to `.env.local` and configure the browser client with
`VITE_PUBLIC_SUPABASE_URL` and `VITE_PUBLIC_SUPABASE_ANON_KEY`. Never expose
the service-role key through a `VITE_` variable.

The regular test suite checks the migration structure without credentials.
The database command below uses `@supabase/supabase-js` against the configured
Supabase project, creates isolated test data, verifies all tables, then removes
the test user and its cascaded data:

```bash
VITE_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co" \
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
