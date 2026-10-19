# Validation ARCH-S3 — Frontières métier et stores

Implémentation du 11 octobre 2026, sous Node 24.19.0, depuis `dev`
`9e2c66f52ad1930c4dbe6177da876fce9a763a7b`, après fusion de la PR #215.
Les résultats distants du commit final sont consignés dans la PR vers `dev`.
Ces changements ne constituent pas un déploiement backend.

## Frontières et dépendances

Le checker AST `scripts/check-business-boundaries.mjs` s'exécute dans
`check:static`. Il interdit les imports React/UI/stores/transport dans le cœur
déterministe, les nouvelles entrées via le barrel services, les accès UI aux
repositories concrets et les nouveaux cycles valeur. Les trois entrées de
services pures déjà utilisées par le replay sont autorisées nommément.

Avant : 374 fichiers, 1 825 imports, 1 648 imports internes et 380 type-only.
Après : 388 fichiers, 1 885 imports, 1 706 internes et 426 type-only.
Les appels du barrel services et les imports `game → stores` sont nuls.
Le cycle valeur hérité conserve six membres, désormais uniquement dans les
stores et leur adapter ; aucun service métier n'appartient à ce cycle.
Les cycles de types communs, effacés à l'exécution, restent documentés.

47 tests de frontières passent. Une injection réelle `import 'react'` dans un
fichier temporaire de `src/game` a produit un exit 1 avec cible et alternative.
Après retrait immédiat du fichier, le même checker retourne 0.
Les responsabilités, exceptions, arêtes et SCC sont détaillés dans
[business-dependency-boundaries.md](business-dependency-boundaries.md).

## Orchestration des runs

`runStoreLifecycleSlice.ts` compose quatre actions publiques inchangées à partir
d'un port d'état. Les services de démarrage, snapshot, journal, soumission/reprise,
finalisation et synchronisation de progression n'importent ni Zustand ni stores.
L'adapter `runLifecycleDependencies.ts` injecte les services, les lectures de
compte, roster et progression, la coordination des onglets et les effets UI.

Les 140 tests existants de démarrage, finalisation, persistance et reprise passent.
20 tests supplémentaires avec état en mémoire et ports injectés prouvent le
démarrage concurrent, l'invité sans réseau, les changements d'identité après une
attente, les réponses append/seal tardives, le journal dédupliqué et la récupération
d'un reçu vérifié sans append/seal. Le rafraîchissement de progression reste
indépendant de la réussite durable ; ses réponses anciennes sont ignorées.
Les 160 tests de ces neuf suites passent ensemble, y compris les erreurs reçues
après un changement A → B → A ou pendant le second essai de démarrage.

Le nom du storage, la version de schéma 7, `partialize`, `migrate` et `merge`
restent identiques. Le module de persistance et le raccord combat ont été déplacés
hors du cœur déterministe, avec leurs consommateurs et tests mis à jour.

## Repositories et contrats

Le client Supabase existant alimente un unique `applicationRepositories`.
Les constructions des repositories sont concentrées dans `RepositoryContainer` ;
les factories de services injectables préservent leurs façades existantes.
`AccountProgressionService` retourne `loaded`, `guest` ou `stale` et ne lit aucun
store. L'état UI applique seulement les résultats appartenant à la requête et au
compte courants, avec contrôles après chaque attente.

Les tests ciblés de services, stores et consommateurs UI passent, dont 48 tests
de rafraîchissement auth, enhancements et progression. Les générations et les
références user/session protègent aussi les retours A → B → A et les réponses
concurrentes du même compte terminant dans l'ordre inverse. Deux tests
base réelle supplémentaires couvrent les snapshots sérialisés et les refus RLS
entre comptes dans `repositoryIntegration.database.test.ts` ; leur résultat final
est fourni par la CI DB. Aucun test n'utilise une base distante pendant le travail
local. Les contrats sont dans [repository-contracts.md](repository-contracts.md).

Les unions difficulté/mode, les types combat et les modèles mastery sont réutilisés
par imports type-only et exports de compatibilité. La matrice distingue types DB
générés, modèles métiers, données jeu, contrats authority et état UI. Les tests
préservent nombres, fractions et enums des sauvegardes existantes, sans coercition.
Voir [domain-data-contracts.md](domain-data-contracts.md).

## Compatibilité et publication

Le bundle source déterministe conserve exactement le hash
`c74af7632acfb7e4a2ff45140d62d0a96bbd6b063994b3f4b43d0f72fa785e16`
de `run-engine-0.2.0`. Les règles, archives authority, migrations SQL et images
ne changent pas. La version applicative et la nouvelle publication FR/EN passent
à `0.2.4`, séquence 9 ; les anciennes publications sont conservées.

`check:static`, `typecheck:strict`, `check:security` et `check:build` passent
localement. Le build propre passe depuis 893 fichiers du dépôt sans données
Data Dragon locales. Les budgets restent inchangés, dont 36 026 octets gzip
mesurés pour le chunk runStore sur un plafond de 38 000.
`check:unit` passe : 269 fichiers, 2 939 tests réussis et 85 tests DB désactivés
localement. Couverture : statements 86,54 %, branches 78,51 %, fonctions 91,43 %,
lignes 88,75 %. Les tests DB sont activés dans la gate CI dédiée.
Le typage strict conserve uniquement les quatre diagnostics tiers déjà autorisés
par le contrat existant. La gate documentaire de publication conserve ses
validations externes en attente ; elle ne représente pas une validation production.

La couverture globale, la CI DB et les parcours navigateur du commit final sont
enregistrés dans la PR ; aucun seuil de vérification n'a été abaissé.
Aucune base distante ni publication backend n'a été modifiée.
