# Contrat des artefacts générés

Le contrat machine est [`config/generated-artifacts.json`](../config/generated-artifacts.json).
Il distingue les sorties générées, les sources manuelles, les preuves de calibration et les
illustrations. Un fichier sous `config` n'est pas automatiquement une sortie de générateur.

```sh
npm run release -- artifacts check
```

Cette commande appartient à `check:static`. Elle lit les fichiers et le suivi Git, construit le
moteur courant avec `esbuild-authority` et `write: false`, puis compare les résultats en mémoire.
Elle ne télécharge rien, ne crée aucun rapport, ne prend aucun verrou et n'écrit aucun fichier,
y compris lorsqu'une comparaison échoue. Aucune nouvelle entrée npm publique n'est ajoutée.

## Sources, recettes, Git et consommateurs

| Famille | Source de vérité et génération | Politique Git et consommateurs | Intégrité / reproduction |
| --- | --- | --- | --- |
| `champions-parsed.json` | Versions dans `scripts/ddragon-version.json`, données Riot, règles de `parse-champions.js`, puis `assets -- download`, `parse`, `package` | Suivi ; `src/data/championDatabase.ts`, moteur et packager | Hash et taille du manifeste, identifiants et versions épinglés. Reproduction amont conditionnelle au cache brut/téléchargement. |
| `champions-client.json`, contenu `fr-FR`, manifeste de sorts compact | Catalogue parsé + manifeste de sorts ; fonctions pures de `scripts/lib/client-champion-catalog.mjs` et `assets -- package` | Suivis ; interface, localisation et icônes de sorts | Comparaison exacte des octets avec les projections régénérées en mémoire, sans cache. |
| Contenu `en-US` | Textes Riot `en_US` à la version épinglée ; `node scripts/generate-champion-i18n.mjs` | Suivi ; `src/i18n/championContent.ts` | Locale, URL/version, identifiants et `contentSha256`. Reproduction du texte amont conditionnelle au réseau. |
| Manifestes Riot complets | Version épinglée, allowlists de `riot-asset-catalog.mjs`, package local ; `assets -- package` | Suivis ; vérificateurs source, build et déploiement | Sources des champions/items/sorts, chemin canonique du catalogue et liens vers les images. |
| `public/assets/riot` | Images Riot épinglées, manifestes précédents ; `assets -- package` | 231 fichiers suivis ; navigateur et vérificateurs | SHA-256, taille, signature PNG, noms et contenu exact du répertoire. Le cache brut `public/lol/data` est ignoré. |
| `config/authority-versions.json` | Registre manuel ; procédure `docs/authority-versioning.md` | Suivi ; tous les outils d'authority et générateurs | Schéma strict, une seule version courante et identité de chaque moteur. Ce registre n'est jamais régénéré à partir des bundles. |
| Résolveur Edge et capacités client `*.generated.ts` | Registre ; `npm run authority:generate` | Suivis ; `verify-run`, capacités de run et filtres d'historique | Comparaison exacte avec les deux renderers existants, exécutés en mémoire. |
| Bundle courant | Entrée `src/game/authority/index.ts`, sources/transitives et dépendance `esbuild-authority` verrouillée ; `release -- edge bundle` | Suivi ; résolveur Edge, parité et CI | Comparaison exacte avec le build sans écriture, hash de contenu et métadonnées de migration. |
| 23 bundles historiques, y compris archives `unsupported` | Octets publiés et identité du registre ; **aucune régénération** | Suivis ; replay, outils historiques et tests. `unsupported` exclut le déploiement, jamais la conservation. | Tous les hashes de contenu et hashes des octets du fixture existant `tests/fixtures/engine-refactor-contract.json`. Les chemins sont résolus par identité moteur, car `0.2.0` a été archivé après la capture. |
| `src/types/database.ts` | Chaîne ordonnée `supabase/migrations/*.sql` appliquée à une DB locale jetable ; `database -- types generate` | Suivi ; client Supabase et repositories | Présence statique. `database -- types check` compare exactement les types formatés au schéma local sans écrire ; il est exécuté par le gate DB. Le contrôle statique ne déclare pas de parité avec une DB absente. |
| Cohortes `config/authority-cohort-baselines-*` | Identité moteur/hash, seeds, générateur de cohortes ; `balance -- baseline generate` | Suivies ; analyse de balance et tests | JSON/classification et recettes conservés ; reproduction coûteuse via `balance -- baseline check --all`. |
| Cohortes `config/early-top-cohort-*` | Moteurs archivés et protocole early-top ; `balance -- early-top generate` | Suivies ; calibration des starters | Reproduction via `balance -- early-top check --all`. |
| Baselines `config/map-economy-baseline-*` | Identité moteur et 1 000 seeds ; `balance -- map-economy generate` | Suivies ; économie/carte et tests historiques | Reproduction courante via `balance -- map-economy check`. Les anciennes baselines restent des preuves figées. |
| Baselines Veigar `config/veigar-run-progression-balance-*` | Identité moteur, scénarios et protocole ; `balance -- veigar generate` | Suivies ; progression et tests | Reproduction via `balance -- veigar check --all`. |
| Calibration terrain `config/authority-field-calibration-*` | Protocole et générateur terrain ; `balance -- field-baseline generate` | Suivie ; comparaison des campagnes | Reproduction via `balance -- field-baseline check`. Les données humaines ne sont pas remplacées par une simulation. |
| Matrice `config/champion-combat-matrix-current.json` | Moteur baseline/candidat, seeds et protocole ; `balance -- combat matrix generate` | Suivie ; gates de balance | Reproduction via `balance -- combat matrix check`. |
| Autres fichiers `config/*.json` | Sources manuelles nommées dans le contrat : rollback, sécurité, scripts, budgets, CSP et readiness | Suivis ; gates dédiés | JSON valide, présence et classification exacte ; les règles métier restent contrôlées par leurs gates existants. |
| `public/assets/ui/combat-arena.webp` | Illustration authored ; pas de générateur déterministe | Suivie ; CSS combat | Présence et suivi Git. La traiter comme une source graphique, pas comme un cache. |

Les recettes de génération modifient volontairement leurs sorties ; elles servent à une mise à jour
revue. Elles ne sont jamais appelées par `release -- artifacts check`. Le contrôle annonce chaque
reproduction conditionnelle afin de distinguer intégrité hors ligne et reproduction complète.
Les autres contrôles existants restent obligatoires : assets source/dist, parité/replay,
balance, types DB, migrations et clean-room.

En développement, `publicDir: false` empêchait Vite de servir les portraits et icônes locales.
Le plugin Riot sert maintenant uniquement les chemins du package de release déclarés dans les
manifestes, ainsi que les illustrations UI locales explicitement autorisées, en `GET`/`HEAD`.
Les chemins inconnus sous `/assets` restent refusés ; le cache brut `public/lol/data` n'est pas
exposé. Les tests HTTP vérifient cette frontière ; les captures navigateur doivent confirmer
le chargement réel des portraits (`naturalWidth > 0`) avec le même serveur avant/après CSS.
Ce correctif concerne le serveur de développement : le package produit et tous les octets des
bundles moteur publiés restent identiques.

## Pourquoi le bundle courant est suivi malgré `.gitignore`

`run-authority.bundle.js` est déjà suivi par Git ; une règle `.gitignore` n'efface pas les fichiers
présents dans l'index. Son dernier renouvellement a été publié par ARCH-15 au commit `968c0b3`.
Sa présence est nécessaire : le registre le désigne comme bundle de `run-engine-0.2.5` et le
résolveur Edge l'importe. Les vérifications de hash, de parity et de clean-room le consomment.
La règle empêche d'ajouter par accident une sortie locale inconnue ; elle ne justifie jamais
`git rm --cached` sur le bundle publié. Le contrôle refuse la disparition du suivi Git du bundle
courant, d'une archive, du registre ou d'une autre source manuelle classée.

Le seul fichier autorisé à ne pas encore être dans l'index est le **nouveau** contrat machine,
uniquement lorsqu'il n'existe pas dans `HEAD` et n'est pas ignoré. Après son premier commit, cette
exception ne s'applique plus. Aucune famille ne bénéficie d'une exemption de suivi Git.

## Erreurs et génération concurrente

Un artefact absent, non classé, ambigu, invalide ou non suivi échoue avec son chemin et une sortie
non nulle. Un résolveur/projection obsolète indique la recette à examiner. Un changement du bundle
courant impose de revoir le versionnement avant toute régénération ; un hash historique n'est
jamais mis à jour pour faire passer le contrôle.

Les contenus des sources et sorties ainsi que les listes de répertoires sont capturés avant les
comparaisons. Les hashes et listes sont relus à la sortie, même après une erreur ; une mutation,
suppression ou apparition de fichier pendant le contrôle échoue et demande de réessayer après
la génération. Le suivi Git est aussi comparé avant/après. Un contrôle de dérive ne répare pas
les fichiers et ne verrouille pas les autres opérations.

Toute nouvelle famille doit déclarer sources, générateur ou édition manuelle, consommateurs,
contrôles, rétention et politique Git. Pour une nouvelle version d'authority, conserver les anciens
octets et étendre explicitement la preuve des bundles figés ; ne jamais réécrire les empreintes
existantes. Le moteur courant reste `run-engine-0.2.5`, gameplay `24`, avec le checkpoint rollback
`968c0b3` et la migration `20261011134126`.

## Rapports temporaires et preuves

Les sorties locales restent dans les répertoires déjà ignorés : `performance-report`, `coverage`,
`test-seed-results`, `strict-typecheck-results`, `test-results`, `playwright-report`, `blob-report`,
`ci-build`, `dist` et le cache brut `public/lol/data`. Les fichiers temporaires des générateurs
utilisent leur répertoire jetable avec nettoyage. Le contrôle n'ajoute ni snapshot ni rapport au
backlog actif ; seules les preuves de calibration publiées dans `config` sont versionnées.

Le 13 octobre 2026, avant les changements S5, un clone neuf sans `node_modules`, `dist`, cache Riot
ou cache de génération a passé `npm ci` (4,37 s, cache npm isolé) et le contrôle du build (6,05 s).
Le gate DB local a passé 130 tests dans 17 fichiers, sans skip, avec types exacts et 67 migrations
jusqu'à `20261011134126`. Ces mesures constituent la baseline ; les résultats finaux S5 sont
consignés dans la validation/PR, séparément d'un déploiement.
