# LolRogue

LolRogue est un roguelike non commercial inspiré de League of Legends. Une partie
traverse six biomes, alterne combats et rencontres, puis enregistre la progression
permanente dans Supabase pour les comptes connectés. Un mode invité permet de jouer
sans compte avec une sauvegarde limitée au navigateur.

L'économie des champions, activable côté serveur, sépare les Candies de maîtrise
des Éclats du compte : trois champions gratuits, cinq en rotation hebdomadaire
UTC et des achats permanents à 400 Éclats gagnés par le gameplay vérifié. Le Daily
garde son roster commun ; les invités ne possèdent pas de wallet. Les comptes
existants conservent leur roster à l'activation. Voir
[le contrat et le rollout](docs/champion-economy.md) ; le flag est OFF par défaut.

## Stack et prérequis

- Node.js 24 dans sa branche majeure, et npm ;
- React 19, TypeScript, Vite et React Router ;
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

Le serveur Vite reste lié à `127.0.0.1` et indique son URL dans le terminal. Les
variables publiques attendues sont :

```env
VITE_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
VITE_PUBLIC_SUPABASE_ANON_KEY=...
```

Seules les valeurs explicitement destinées au navigateur peuvent être préfixées
par `VITE_`. La clé `SUPABASE_SERVICE_ROLE_KEY` contourne les RLS : elle est
réservée aux tests d'intégration et ne doit jamais être placée dans le bundle ou
dans Vercel côté client.

Sans configuration Supabase valide, l'application reste utilisable en mode invité.
L'état de la partie, la maîtrise et les réglages sont alors conservés dans le
`localStorage` du navigateur. Effacer les données du site les supprime.

Les diagnostics applicatifs en base sont désactivés par défaut. Leur activation
est un opt-in via `VITE_ENABLE_DB_LOGGING=true`; ils sont alors attribués par le
serveur, limités, sanitisés et supprimés après 14 jours.

## Supabase local et migrations

```bash
npm run database -- start
npm run database -- reset --yes
npm run database -- lint
npm run database -- types generate
npm run release -- edge serve
npm run database -- stop
```

`npm run database -- reset` exige `--yes`, utilise exclusivement la base locale et propose
`--dry-run` pour consulter la commande avant exécution. Le
schéma initial est dans
`supabase/migrations/00000000000000_schema.sql`; les migrations horodatées qui
suivent mettent à niveau une base ayant déjà exécuté une ancienne version du
schéma. Sur le projet distant correspondant à la branche effective `dev` ou `main`,
prévisualiser les migrations avant de les appliquer :

```bash
npm run database -- link --project-ref PROJECT_REF --yes
npm run database -- migrate --project-ref PROJECT_REF --preview
npm run database -- migrate --project-ref PROJECT_REF --yes
```

Le déploiement complet est automatisé et limité aux branches de release. La référence
explicite doit correspondre à la branche réelle et `--yes` confirme la mutation :

```bash
npm run release -- deploy --project-ref PROJECT_REF --yes
```

La [configuration des environnements](docs/environment-contract.md) décrit les
variables publiques autorisées, leur priorité et les préflights distants.

La branche `dev` cible Supabase `LolRogueDev` et un déploiement Vercel Preview ;
la branche `main` cible Supabase `LolRogue` et Vercel Production. La commande
prévisualise les migrations, publie la fonction Edge puis le frontend compatible,
applique toutes les montées de version en attente et vérifie leur manifeste distant.
Sur `main`, le build Production est d'abord créé sans changer le domaine public,
puis promu seulement après ce contrôle. Toute autre branche est bloquée avant le
premier appel distant.

Les précontrôles utilisent Supabase depuis les dépendances verrouillées du dépôt.
Vercel `59.11.7` doit être disponible dans le cache npm avant le déploiement ; sa
préparation explicite est `npx --yes --package=vercel@59.11.7 vercel --version`.
Le déploiement emploie ensuite cette version en mode `--offline`.

Ne jamais utiliser `db reset` sur la production. Le projet n'utilise pas de système
de mailing : la confirmation d'adresse doit être désactivée dans
Authentication → Providers → Email. La procédure détaillée est dans
[supabase/README.md](supabase/README.md).

## Commandes de qualité

Les commandes regroupées `balance`, `database`, `assets`, `release` et `testing`
proposent une aide avec `npm run <groupe> -- --help`. Le [guide de la CLI](docs/script-cli.md)
décrit les options et confirmations ; l'[inventaire des scripts](docs/script-inventory.md)
relie chaque ancien alias à sa commande canonique et à ses appelants.

```bash
npm test              # tests unitaires et tests de structure SQL
npm run test:coverage # tests avec seuils de couverture
npm run test:e2e      # parcours UI, dont une victoire six biomes et une défaite réelles
npm run test:e2e:production # smoke test des 3 moteurs, desktop et mobile
npm run test:db       # intégration Auth/RLS sur une vraie instance de test
npm run testing -- production-build # deep links, headers et 404 du build servi
npm run testing -- performance budgets # budgets bundle, routes et assets
npm run assets -- deployed verify # vérifie les 187 assets sur DEPLOYMENT_URL/Vercel
npm run release -- edge bundle   # bundle du replay serveur + contrôle du hash de contenu
npm run testing -- security # audit critique/haut et contrôle des exceptions bornées
npm run check         # format, lint, types, audit, couverture et build
```

Le scénario six biomes joue réellement la carte, les encounters et les combats.
D'autres specs ciblées injectent volontairement un état de store afin d'isoler un
comportement d'interface ; elles ne constituent pas à elles seules une preuve de
run complète. La politique des seuils, le périmètre mesuré et les artefacts CI sont
décrits dans [`docs/testing.md`](docs/testing.md).

Pour les tests de base en local, démarrer Supabase puis exporter les valeurs
retournées par `supabase status -o env` sous les noms de `.env.example`. La CI
recrée automatiquement une instance locale jetable.

## Architecture

```text
src/
├── components/          composants React partagés et gardes de routes
├── data/                définitions de champions, objets, runes et augments
├── features/            modules Daily, combat et préparation des champions
├── game/                règles déterministes et replay autoritaire
├── infrastructure/      composition unique des dépôts applicatifs
├── pages/               écrans chargés paresseusement par React Router
├── services/
│   ├── interfaces/      contrats des dépôts
│   ├── repositories/    implémentations Supabase
│   └── container/       façade de compatibilité du conteneur applicatif
├── shared/              composants UI et hooks communs
├── stores/              état Zustand et orchestration de l'interface
├── types/               modèles applicatifs et types Supabase générés
└── utils/               calculs et utilitaires transverses
public/assets/riot/      paquet minimal d'images Riot épinglées et versionnées
supabase/functions/      vérification Edge des journaux scellés
supabase/migrations/     schéma initial et montées de version
tests/                   tests Vitest
e2e/                     tests Playwright
docs/                    documentation maintenue
```

Les règles pures appartiennent à `src/game`, l'accès distant passe par les
interfaces de dépôt, et les stores coordonnent l'état d'écran. Les détails sur la
propriété de chaque donnée sont dans [docs/data-and-persistence.md](docs/data-and-persistence.md).

Les [contrats des artefacts](docs/generated-artifacts.md) indiquent quoi générer,
vérifier et conserver dans Git. `npm run release -- artifacts check` contrôle leur
dérive sans écrire de fichier. Le [contrat CSS](docs/css-maintenance.md) décrit la
cascade et les preuves visuelles ; l'[audit des dépendances](docs/dependency-audit.md)
conserve les décisions et la dette restante.

## Assets

Les 172 portraits du catalogue serveur, les 15 icônes d'objets utilisés et les
44 icônes de sorts — soit 231 fichiers — sont versionnés sous
`public/assets/riot/<version>` avec leurs SHA-256. Onze
champions sont actuellement jouables, mais la page Database et le catalogue
serveur exposent l'ensemble. Le catalogue importé est sous `src/data/generated`.
Le cache brut `public/lol/data` est un espace de génération local : Vite l'exclut
explicitement de `dist` et il n'est jamais nécessaire à un build normal.

```bash
npm run assets -- update
```

Cette commande télécharge la version déclarée dans
`scripts/ddragon-version.json`, régénère le sous-ensemble jouable, extrait le
paquet minimal et recalcule son manifest d'intégrité. Voir
[docs/assets.md](docs/assets.md) avant toute mise à jour. `npm run check` exécute
aussi un build temporaire sans aucun fichier ignoré pour reproduire un clone
propre.

Le serveur de développement sert les fichiers Riot déclarés dans les manifestes,
le décor de combat et le script de locale. Une ressource manquante renvoie 404 ;
le cache brut reste exclu. Après une mise à jour des manifestes, redémarrer Vite
pour charger leur nouvelle liste de fichiers.

## Documentation

- [Décisions produit transverses](docs/product-decisions.md)
- [Gate de sortie bêta](docs/beta-readiness.md)
- [Données et persistance](docs/data-and-persistence.md)
- [Règles de jeu et équilibrage](docs/gameplay.md)
- [Contrat de contenu et simulations](docs/content-balance.md)
- [Progression et personnalisation](docs/progression-personalization.md)
- [Social, confidentialité et classement](docs/social-leaderboard.md)
- [Légal et confidentialité](docs/legal-and-privacy.md)
- [Administration sécurisée](docs/administration.md)
- [Définitions et fiabilité des métriques admin](docs/admin-metrics.md)
- [Fiches joueurs, historiques et exports admin](docs/admin-explorer.md)
- [Déploiement et exploitation](docs/operations.md)
- [Runbooks d'incident](docs/incident-runbooks.md)
- [Sauvegarde et restauration](docs/backup-and-restore.md)
- [Release, environnements et support](docs/release-and-support.md)
- [Roadmap et checklist de release](docs/roadmap.md)
- [Assets Riot](docs/assets.md)
- [Audit des dépendances](docs/dependency-audit.md)
- [Matrice fonctionnalités et preuves](docs/feature-status.md)

## Déploiement

Le build de production est généré par `npm run build` dans `dist/`. Vercel utilise
`vercel.json` pour la réécriture SPA et les en-têtes de sécurité. Avant une mise en
production, suivre la checklist de
[release et support](docs/release-and-support.md), renseigner
les deux variables `VITE_PUBLIC_SUPABASE_*` dans l'environnement Vercel et vérifier
les URL de redirection Auth dans Supabase.

## Licence et propriété intellectuelle

Le code est distribué sous [licence MIT](LICENSE). League of Legends et ses assets
sont la propriété de Riot Games, Inc. LolRogue n'est ni affilié à Riot Games, ni
approuvé par Riot Games.
