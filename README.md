# LolRogue

LolRogue est un roguelike non commercial inspiré de League of Legends. Une partie
traverse six biomes, alterne combats et rencontres, puis enregistre la progression
permanente dans Supabase pour les comptes connectés. Un mode invité permet de jouer
sans compte avec une sauvegarde limitée au navigateur.

## Stack et prérequis

- Node.js 22 et npm ;
- React 18, TypeScript, Vite et React Router ;
- Zustand pour l'état client ;
- Supabase pour Auth, PostgreSQL et les règles RLS ;
- Vitest, Testing Library et Playwright pour les tests ;
- Biome comme unique outil de lint et de formatage.

Docker est également nécessaire pour exécuter Supabase en local.

## Installation

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Le serveur Vite indique son URL dans le terminal. Les variables publiques attendues
sont :

```env
VITE_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
VITE_PUBLIC_SUPABASE_ANON_KEY=...
```

Seules ces deux valeurs publiques peuvent être préfixées par `VITE_`. La clé
`SUPABASE_SERVICE_ROLE_KEY` contourne les RLS : elle est réservée aux tests
d'intégration et ne doit jamais être placée dans le bundle ou dans Vercel côté
client.

Sans configuration Supabase valide, l'application reste utilisable en mode invité.
L'état de la partie, la maîtrise et les réglages sont alors conservés dans le
`localStorage` du navigateur. Effacer les données du site les supprime.

## Supabase local et migrations

```bash
npm run db:start
npm run db:reset
npm run db:lint
npm run db:types
npm run edge:serve
npm run db:stop
```

`db:reset` est destructif et ne doit viser qu'une instance locale ou jetable. Le
schéma initial est dans
`supabase/migrations/00000000000000_schema.sql`; les migrations horodatées qui
suivent mettent à niveau une base ayant déjà exécuté une ancienne version du
schéma. Sur un projet distant existant, utiliser :

```bash
supabase link --project-ref PROJECT_REF
npm run migrate
```

Ne jamais utiliser `db reset` sur la production. Le projet n'utilise pas de système
de mailing : la confirmation d'adresse doit être désactivée dans
Authentication → Providers → Email. La procédure détaillée est dans
[supabase/README.md](supabase/README.md).

## Commandes de qualité

```bash
npm test              # tests unitaires et tests de structure SQL
npm run test:coverage # tests avec seuils de couverture
npm run test:e2e      # parcours navigateur des six biomes
npm run test:db       # intégration Auth/RLS sur une vraie instance de test
npm run edge:bundle   # bundle du replay serveur + contrôle du hash de contenu
npm run check         # format, lint, types, couverture et build
```

Pour les tests de base en local, démarrer Supabase puis exporter les valeurs
retournées par `supabase status -o env` sous les noms de `.env.example`. La CI
recrée automatiquement une instance locale jetable.

## Architecture

```text
src/
├── components/          composants React partagés et gardes de routes
├── data/                définitions de champions, objets, runes et augments
├── game/                règles déterministes et replay autoritaire
├── pages/               écrans chargés paresseusement par React Router
├── services/
│   ├── interfaces/      contrats des dépôts
│   ├── repositories/    implémentations Supabase
│   └── container/       composition et injection des dépendances
├── stores/              état Zustand et orchestration de l'interface
├── types/               modèles applicatifs et types Supabase générés
└── utils/               calculs et utilitaires transverses
public/lol/data/         données et images Riot épinglées
supabase/functions/      vérification Edge des journaux scellés
supabase/migrations/     schéma initial et montées de version
tests/                   tests Vitest
e2e/                     tests Playwright
docs/                    documentation maintenue
```

Les règles pures appartiennent à `src/game`, l'accès distant passe par les
interfaces de dépôt, et les stores coordonnent l'état d'écran. Les détails sur la
propriété de chaque donnée sont dans [docs/data-and-persistence.md](docs/data-and-persistence.md).

## Assets

Les assets Riot nécessaires au jeu sont versionnés sous `public/lol/data` afin que
le build et les parties soient reproductibles. Ils ne sont pas téléchargés pendant
un build normal.

```bash
npm run assets:update
```

Cette commande télécharge la version déclarée dans
`scripts/ddragon-version.json`, puis régénère `champions-parsed.json`. Voir
[docs/assets.md](docs/assets.md) avant toute mise à jour.

## Documentation

- [Données et persistance](docs/data-and-persistence.md)
- [Règles de jeu et équilibrage](docs/gameplay.md)
- [Administration sécurisée](docs/administration.md)
- [Déploiement et exploitation](docs/operations.md)
- [Roadmap et checklist de release](docs/roadmap.md)
- [Assets Riot](docs/assets.md)
- [Audit des dépendances](docs/dependency-audit.md)

## Déploiement

Le build de production est généré par `npm run build` dans `dist/`. Vercel utilise
`vercel.json` pour la réécriture SPA et les en-têtes de sécurité. Avant une mise en
production, suivre la checklist de [docs/roadmap.md](docs/roadmap.md), renseigner
les deux variables `VITE_PUBLIC_SUPABASE_*` dans l'environnement Vercel et vérifier
les URL de redirection Auth dans Supabase.

## Licence et propriété intellectuelle

Le code est distribué sous [licence MIT](LICENSE). League of Legends et ses assets
sont la propriété de Riot Games, Inc. LolRogue n'est ni affilié à Riot Games, ni
approuvé par Riot Games.
