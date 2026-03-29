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

## Path Aliases

- `@/` → `src/`
- `@data/` → `data/`
- `@assets/` → `assets/`

## License

This project is licensed under the [MIT License](./LICENSE).

LolRogue is a non-commercial fan project inspired by League of Legends (© Riot Games).
League of Legends and all related assets are trademarks of Riot Games, Inc.
This project is not affiliated with or endorsed by Riot Games.
