# ARCH — Architecture, maintenance et scripts

**Statut : ARCH-S1 implémenté, appelants migrés et alias retirés après CI verte ; ARCH-S2, ARCH-S3, ARCH-S4 et ARCH-S5 implémentés.** **Source :** audit statique de `dev` le 10/10/2026. **Responsable logique :** outillage + architecture. Les tâches ARCH concernent la structure, pas l'ajout de nouvelles fonctionnalités métier. Les validations et opérations distantes restent distinctes.

[Retour au TODO](../../TODO.md) · [Bot tactique](tactical-bot.md) · [Arbres de Candies](champion-enhancement-trees.md) · [Administration](admin-console.md)

## Invariants obligatoires

- [ ] Préserver les sauvegardes locales (`RUN_STORAGE_KEY`/`RUN_SCHEMA_VERSION`), les schémas RPC/RLS, le journal des commandes, les replays historiques et les hashes des bundles authority. Aucun déplacement ne doit changer le comportement sérialisé.
- [ ] Conserver `src/game` indépendant des composants React, stores Zustand et accès réseau : aucun import UI/DB dans le cœur déterministe.
- [ ] Ne jamais supprimer les bundles `supabase/authority-archive` parce qu'ils sont « vieux » : `unsupported` signifie hors déploiement, pas effaçable ; ne jamais recalculer un hash historique.
- [ ] Déployer `main` exclusivement vers LolRogue production et `dev` vers LolRogueDev ; toutes les autres branches bloquées par `backend:deploy`. Ne jamais afficher/exposer les secrets `service_role`.
- [ ] Garder les noms des required checks `validate`, `e2e`, `database` et `clean-room`, ainsi que les alias npm qui les alimentent, pendant la migration CI.
- [ ] Ne pas modifier en même temps l'architecture, l'algorithme du bot, les règles des arbres ou le modèle des récompenses : une PR = un groupe de responsabilités et des preuves de non-régression.

## ARCH-S1 — Catalogue de scripts et CLI (P2, taille L)

Livrables : [guide CLI](../script-cli.md), [table d’équivalence](../script-inventory.md) et [inventaire machine](../scripts-inventory.json). Les 105 noms initiaux restent dans l'historique. La migration des appelants a été livrée dans la [PR #213](https://github.com/Thanan71/LolRogue/pull/213), avec 18 checks verts au SHA `1b7ab8eea16574e81394c2212417d432d5459c0c`. Après recherche globale sans appel actif restant, 72 alias sont retirés et 40 entrées restent publiques. Le [manifeste de retrait](../../config/script-alias-retirement.json) conserve la preuve CI et les exceptions historiques bornées ; l'inventaire bloque tout appel actif à un alias retiré. `balance:repro` et `authority:generate` restent disponibles pour les contrats inscrits dans les artefacts figés et les résolveurs générés.

### ARCH-01 — Inventorier les scripts, propriétaires et appelants
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Extraire la liste des 105 entrées `scripts` de `package.json` ; classer usage courant, CI, déploiement, génération, maintenance, diagnostic, historique.
  - [x] Scanner les références exactes à `npm run …` dans `.github/workflows`, `README.md`, `docs`, tests et scripts ; marquer « contrat externe » / « interne ».
  - [x] Figer le périmètre des commandes publiques utilisées par développeurs, CI et release, sans supposer qu'un script absent de la recherche est inutile.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Identifier les scripts exposés mais jamais appelés ; vérifier leur utilité avant dépréciation. Ne pas confondre « non référencé » et « inutilisé ».
  - [x] Publier un tableau ancien nom → nouvel appel → consommateurs → compatibilité prévue.
  - [x] Produire un inventaire machine-readable `scripts-inventory.json` sous docs ou outillage avec propriétaire, risques, arguments et commande de remplacement.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester la présence des 105 entrées initiales dans l'inventaire, y compris hooks `prebuild`/`postbuild` et références indirectes.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-02 — Créer une CLI sans dépendance superflue
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Ajouter `scripts/cli.mjs` et des routeurs `scripts/commands/{balance,database,assets,release,testing}/` ; préserver le code des scripts métier existants.
  - [x] Fournir `--help`, messages d'erreur utiles, validation des arguments et code de sortie non nul en cas d'échec.
  - [x] Choisir une grammaire de sous-commandes et options sans ambiguïté (`--`, `--engine`, `--help`) et des erreurs structurées.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Définir les commandes canoniques : `balance -- baseline generate --engine v22`, `balance -- baseline check --all`, `balance -- check` et équivalents DB/assets.
  - [x] Ajouter des tests CLI : aide, arguments invalides, sélection de version, erreurs propagées ; refuser les commandes silencieuses.
  - [x] Conserver les appels Node avec propagation de `stdout`, `stderr` et du code de retour pour les commandes chaînées.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester appel valide, argument manquant, option inconnue, commande inexistante et interruption de sous-processus.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-03 — Réduire les commandes publiques et dédupliquer les versions
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Remplacer les alias `balance:baseline:generate:v15`…`v22` et `balance:early-top:generate:v17`… par des options `--engine` documentées.
  - [x] Lire la version par défaut depuis `config/authority-versions.json` : la commande `generate` du moteur courant ne doit plus retomber sur `v21` pendant que `v22` est actif.
  - [x] Lister explicitement les alias conservés provisoirement et la source de version canonique actuelle dans le registre.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Conserver temporairement `build`, `prebuild`, `postbuild`, `test`, `check`, `check:static`, `check:unit`, `check:db`, `check:browser`, `check:build`, `backend:deploy` et tous les noms appelés par CI/documentation.
  - [x] Migrer tous les appelants en PR séparée, retirer les alias uniquement après recherche globale et CI verte ; viser environ 30–40 entrées npm publiques, sans en faire un critère artificiel.
  - [x] Mettre un avertissement de dépréciation seulement après migration de tous les consommateurs et écrire la table d'équivalence.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Comparer génération/check sur moteurs v15 à v22 et vérifier que la version par défaut n'est pas silencieusement v21.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-04 — Sécuriser les scripts critiques
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Tester les modes lecture/`--check` sans modifier les fichiers suivis ; documenter précisément les générateurs qui écrivent volontairement.
  - [x] Introduire `--dry-run`/confirmation explicite pour les commandes destructives, en respectant les contrats Supabase CLI existants.
  - [x] Distinguer actions qui lisent, génèrent localement, détruisent ou déploient afin de définir le niveau de confirmation.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Distinguer scripts utilisés dans `postinstall`, génération à la demande et opérations distantes ; conserver le patch Supabase Auth tant qu'une preuve de retrait sûr manque.
  - [x] Vérifier les chemins depuis la racine et l'exécution sous Node 24 sur Linux/macOS ; éviter `npx` non épinglé pour un outil sensible.
  - [x] Faire échouer les commandes dangereuses avant le premier effet externe si cible, droits ou préconditions manquent.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Simuler branche interdite, CLI absente, échec patch Supabase et reset destructif sans toucher à une vraie base.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
La version par défaut vient du registre authority (actuellement `run-engine-0.2.0`). Les anciennes commandes early-top/affordability conservent explicitement leurs moteurs v21/v18 ; la CLI refuse un moteur non pris en charge au lieu de modifier leurs protocoles historiques.

**Acceptation S1 :** même sortie et mêmes artefacts pour les commandes existantes et nouvelles ; `npm ci`/CI ne régressent pas ; aucun nom de check GitHub requis n'est cassé.

## ARCH-S2 — Configuration et déploiement (P1, taille M/L)

Livrables : [contrat des environnements](../environment-contract.md), [preuve de validation S2](../architecture-s2-validation-2026-10-11.md), plugins dans `tooling/vite/plugins/`, politique Vitest dans `tooling/vitest/testPolicy.ts` et gardes `scripts/lib/remote-operation.mjs`. Les tests des commandes distantes sont entièrement simulés ; aucun déploiement ni changement de base distante ne fait partie de cette implémentation.

### ARCH-05 — Source unique de configuration d'environnement
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Mutualiser les références publiques Supabase de `vite.config.ts` et `scripts/deploy-backend.mjs` dans un module compatible Node/Vite ; aucune clé privée versionnée.
  - [x] Documenter les environnements local, preview `dev` et production `main`, ainsi que la provenance des variables Vercel.
  - [x] Énumérer les variables autorisées au navigateur et la matrice environnement → branche → projet Supabase.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Vérifier que les builds preview `dev` ciblent toujours LolRogueDev même si des variables Preview globales ciblent la production.
  - [x] Tester les erreurs de configuration (branche inconnue, SHA invalide, clés absentes, mélange de projets).
  - [x] Supprimer les copies manuelles de refs sans toucher aux secrets, puis vérifier la priorité des variables Vercel.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester dev/prod/local, valeurs globales Preview contradictoires et clés manquantes ; confirmer aucune clé `service_role` dans `dist/`.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-06 — Protéger chaque commande DB distante
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Passer en revue `migrate`, `edge:deploy`, `backend:deploy`, commandes `--linked` et `--project-ref` ; expliciter quelles entrées peuvent atteindre la production.
  - [x] Conserver le blocage `backend:deploy` hors `main`/`dev` et exiger une cible explicite contrôlée pour toute opération distancée ; ne pas transformer `db:reset` local en opération distante.
  - [x] Qualifier chaque commande SQL/Edge de locale, liée au projet ou distante ; interdire les noms de cible implicites en prod.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Tester avec des faux exécutables/processus sans pousser de migration réelle ; consigner les cibles dans les logs sans secrets.
  - [x] Vérifier ordre migration/Edge/frontend/rollout/rollback, en préservant les contrats authority existants.
  - [x] Introduire un préflight qui vérifie branche, projet distant et confirmation avant opération mutable.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Rejouer `main`, `dev`, `feature/*`, detached HEAD et `--project-ref` incorrect dans des tests entièrement simulés.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-07 — Extraire les plugins Vite et les responsabilités Vitest
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Extraire les plugins internes d'injection d'identité, ressources PWA, assets Riot et catalogue champion dans `build/plugins/` ou `tooling/vite/`.
  - [x] Séparer la configuration couverture Vitest des politiques de déploiement tout en maintenant les mêmes seuils, exclusions et budgets.
  - [x] Recenser les plugins Vite et leurs entrées/sorties, plus les seuils Vitest existants avant extraction.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Vérifier octet par octet ou avec manifest/hash les fichiers produits : assets, méta-SHA, manifest, routes profondes.
  - [x] Maintenir la règle actuelle `publicDir: false` et le pipeline d'assets intégrité Riot, sauf décision explicitement testée.
  - [x] Déplacer à fonctionnalités identiques les plugins internes sans modifier l'ordre d'exécution ni les paths d'assets.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Comparer manifests, identité SHA, chemins PWA et chunks navigateur avant/après sur build propre.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
**Acceptation S2 :** matrices `dev`/`main`/branche interdite testées ; `check:build`, contrôles d'assets et tests de déploiement inchangés ; aucune fuite de `service_role`.

## ARCH-S3 — Frontières métier et stores (P2, taille L/XL)

### ARCH-08 — Cartographier les dépendances
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Générer la carte `pages → hooks → services → repositories` et les cycles éventuels, avec preuves par imports.
  - [x] Définir une règle CI vérifiable : `src/game` n'importe ni `pages`, ni `stores`, ni `services/supabaseClient`.
  - [x] Définir les couches permises et les exceptions d'import justifiées par le replay ou les interfaces communes.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Éviter les imports massifs via les barrels `src/services/index.ts` ; privilégier les entrées de domaine explicites.
  - [x] Mesurer le graphe avant/après pour détecter les régressions réelles et éviter les renommages cosmétiques.
  - [x] Mettre une règle automatique avec message indiquant l'import interdit et sa cible de remplacement.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Injecter un import React fictif dans `src/game` pour prouver que le test le détecte, puis restaurer.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-09 — Découper `runStoreLifecycleSlice.ts` (~41 Ko)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Séparer les orchestrations `start`, `end/finalize`, `retry/save`, `sync progression` et `authority journal` des mutations Zustand.
  - [x] Conserver les signatures publiques `useRunStore` et l'unique politique de persistance/merge ; aucune migration de sauvegarde sans test de migration.
  - [x] Cartographier les transitions `start`, `save`, `retry`, `finalize`, `reload` et leurs effets observables.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Injecter les services/repositories au lieu de consulter plusieurs stores directement depuis des règles métier, lorsque possible.
  - [x] Tester double clic, rechargement en sauvegarde, retry après réseau, run ancienne version et idempotence.
  - [x] Déplacer orchestration dans des services réutilisables et laisser les slices Zustand gérer uniquement les mutations d'état.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Comparer snapshots legacy, appels concurrents de démarrage, rechargement en cours de sauvegarde et idempotence.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-10 — Stabiliser le conteneur de repositories
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Conserver `RepositoryContainer` et ses interfaces comme point d'accès DB ; éviter de créer un deuxième système DI parallèle.
  - [x] Isoler le rafraîchissement des données serveur et l'état UI pour éviter qu'un service métier dépende directement des hooks/stores.
  - [x] Lister interfaces réutilisées et contrats de dépendance du `RepositoryContainer` existant.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Vérifier auth/RLS et contrats de sérialisation avec tests base réelle ; maintenir le mode invité sans DB.
  - [x] Éviter de déplacer ou modifier les méthodes de repositories sans consommateurs/tests mis à jour.
  - [x] Introduire injection explicite dans les services critiques, sans multiplier les conteneurs ou clients Supabase.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester invités hors ligne, droits connectés, refus RLS et refresh de progression avec identité changée.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-11 — Contrats de données et invariants
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Documenter la propriété de chaque type : catalogue champion, instance de combat, état run, tentative authority, progression de compte et devise.
  - [x] Ajouter des tests de frontières et d'import ; suivre explicitement schémas générés `src/types/database.ts` versus modèles métiers.
  - [x] Faire une matrice d'appartenance pour types UI, modèles DB, contrats authority et données jeu immuables.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Éviter la création de types en double entre `src/types`, `src/game` et `src/features` ; rediriger progressivement vers des exports stables.
  - [x] Remplacer les duplications par des imports explicites, en gardant les adaptateurs de compatibilité existants.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Contrôler compilations app/scripts/e2e et migration des snapshots sans conversion de nombres ou enums.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
**Acceptation S3 :** sauvegardes anciennes restaurées, composants inchangés extérieurement, invariants authoritative conservés et aucune nouvelle dépendance circulaire.

## ARCH-S4 — Modules UI orientés fonctionnalités (P2, taille XL)

### ARCH-12 — Migrer par tranche, pas par renommage global
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Introduire progressivement `src/features/{combat,champions,champion-economy,progression,runs,daily,inventory,authentication,administration}`.
  - [x] Conserver `src/game/{battle,authority,rules,effects,map,balance}` ; déplacer seulement l'UI et les orchestrations concernées.
  - [x] Choisir un seul module pilote et mesurer ses consommateurs avant déplacement ; documenter l'API publique.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Introduire `src/shared/{ui,i18n,styles,assets,utils}` et `src/infrastructure/{supabase,repositories,persistence,observability}` uniquement lorsqu'un module en a besoin.
  - [x] Ne pas casser les imports historiques d'un coup ; tests et builds après chaque déplacement.
  - [x] Migrer imports par petites PR sans créer une structure miroir qui double stores, services ou règles.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Vérifier l'absence d'imports résiduels, builds navigateur, routes et bundle size à chaque étape.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-13 — Alléger `CombatPage.tsx` (~39 Ko)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Extraire un hook/contrôleur des décisions UI : sélection des actions et cibles, autoplay, statut du combat, effets visuels.
  - [x] Conserver validations dans `BattleActionValidator` et calculs dans le moteur, pas de règles dupliquées en JSX.
  - [x] Recenser les actions UI versus règles métier, y compris ciblage, autoplay, délais et états chargés.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Tester manuel/auto, contrôles clavier/tactile, multi-cibles, refresh et authority.
  - [x] Coordonner cette extraction avec `AI-001` et suivants : l'IA reste dans le moteur et ne dépend pas du contrôleur React.
  - [x] Extraire un contrôleur UI sans remplacer le validateur canonique ni appliquer deux fois une action.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester combat manuel, auto ×1/×2/×3, cible alliée/ennemie et reprise après navigation.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-14 — Alléger `StarterSelectPage.tsx` (~31 Ko)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Extraire la préparation de run et la sélection du mode Daily/standard, filtres du catalogue, affichage de l'économie.
  - [x] Remplacer l'instanciation directe de `SupabaseDailyRunRepository` dans la page par une orchestration testable et des interfaces existantes.
  - [x] Définir séparément les contrats de sélection de champion, filtrage, mode Daily et accès économique.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Vérifier modes invité/connecté, choix des champions, roster acheté/rotation, rechargement et i18n.
  - [x] Introduire un service/app hook unique pour le Daily au lieu de `new SupabaseDailyRunRepository` depuis JSX.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester champion gratuit/acheté/rotation, invité, erreur réseau, persistance et navigation vers run.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-15 — Refactor moteur `BattleManager`/`AuthorityRunEngine` sous contrat
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Extraire en petites unités les résolveurs/gestionnaires déjà identifiés sans changer ordre RNG, ordre événements ni sérialisation.
  - [x] Ne modifier le moteur autoritaire courant qu'avec versioning/parité si la sémantique change ; jamais réécrire un bundle `replay-only` ou `unsupported`.
  - [x] Repérer les étapes pures et l'ordre exact de consommation RNG avant tout déplacement de résolveur.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Ajouter tests de snapshots/replay/seed et comparer sortie des builds avec les fixtures avant/après.
  - [x] Isoler les résolveurs en maintenant l'ordre des callbacks et le format de chaque commande autoritaire.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Comparer traces octet à octet, seeds versionnées, snapshots de versions historiques et rapports de cohorte.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
Preuves : [validation ARCH-S4](../architecture-s4-validation-2026-10-13.md), [contrat des modules](../feature-module-contract.md), [contrat combat](../feature-combat-contract.md), [contrat sélection](../feature-starter-contract.md) et [contrat moteur](../engine-refactor-contract.md). Le pilote est Daily ; les autres domaines sont migrés uniquement lorsqu’une tranche le nécessite. Les résultats distants du commit final sont consignés dans la PR.

**Acceptation S4 :** UX inchangée, modules autonomes, testabilité augmentée, pas de divergence client/authority.

## ARCH-S5 — Artefacts, CSS et dette suivie (P2, taille M/L)

Implémentation `0.2.6` : [validation et mesures](../architecture-s5-validation-2026-10-13.md),
[contrat des artefacts](../generated-artifacts.md), [maintenance CSS](../css-maintenance.md)
et [audit des dépendances](../dependency-audit.md). Les résultats CI du commit candidat
sont consignés dans la PR vers `dev` ; fusion et déploiement restent séparés.

### ARCH-16 — Classer les fichiers générés
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Définir pour `src/data/generated`, `config`, bundles authority, types DB et `public/assets` : source, commande de génération, contrôle d'intégrité, politique Git et consommateur.
  - [x] Vérifier pourquoi `run-authority.bundle.js` apparaît suivi malgré sa règle `.gitignore` ; conserver sa présence si nécessaire au registre/gates.
  - [x] Identifier la source-of-truth, le générateur, la rétention et les références croisées de chaque artefact.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Ne supprimer aucun bundle/version de DB/archive sans matrice de compatibilité et tests.
  - [x] Ranger les rapports temporaires dans les répertoires ignorés appropriés ; pas de snapshots bruyants dans le backlog actif.
  - [x] Ajouter une vérification de dérive en lecture seule plutôt qu'une suppression automatisée des archives.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester build neuf depuis clone sans cache et comparaison des hashes d'authority archivés.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-17 — Rationaliser CSS et composants
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Cartographier les 26 feuilles sous `src/styles` et les doublons de tokens/composants ; relever spécificité et dépendances aux imports.
  - [x] Garder les variables de design, accessibilité, réduction d'animation, focus et responsive ; mutualiser seulement après vérification visuelle.
  - [x] Inventorier variables CSS, cascade, styles importés par page et comportements mobile/accessibilité.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Ne pas ajouter un deuxième design system durant la refonte admin/arbre ; réutiliser `shared/ui`.
  - [x] Mutualiser des tokens uniquement après preuve de parité visuelle, sans retoucher le moteur ni les données.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Captures desktop/mobile, focus visible, reflow équivalent à 400 %, reduced-motion et contrastes comparés avant/après ; limites de la preuve automatisée documentées.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.

### ARCH-18 — Audit des dépendances et qualité
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Vérifier packages directs/indirects, versions épinglées, patch Supabase Auth, imports morts et scripts non référencés ; ne retirer que sur preuve.
  - [x] Faire passer `npm ci`, `npm run check`, `npm run check:db`, `npm run check:browser`, `npm run balance -- check` et workflows spécialisés pertinents.
  - [x] Fixer une baseline mesurée des temps CI, tailles de bundles et dépendances utilisées.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Documenter avant/après : temps d'installation, durée de CI, taille bundle navigateur/Edge, nombre de scripts npm, fichiers couplés.
  - [x] Mettre à jour `README.md` et docs d'exploitation, et archiver les seuls éléments effectivement terminés.
  - [x] Retirer une dépendance seulement après recherche d'import runtime/script et remplacement du patch si applicable.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Vérifier audit, compilation et CI propre puis documenter gains chiffrés et éventuels compromis.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
**Acceptation générale ARCH :** aucune fonctionnalité perdue, pas de changement silencieux de contrat de déploiement/authority ; démonstration chiffrée de la simplification.

## Interfaces et doublons évités

- `ARCH-13` extrait le contrôleur combat ; `AI-001..049` conçoit **la politique de décision**, sans dupliquer l'UI.
- `ARCH-14` et `ADM-31..36` réutilisent les mêmes patterns UI, mais les modules admin appartiennent au domaine administration.
- `ARCH-16` conserve les historiques authority : la décision de désactiver des versions est traitée par `docs/authority-versioning.md`, pas par nettoyage de fichiers.
- `ARCH-05/06` sont les uniques propriétaires du routage environnement ; les autres sprints n'ajoutent pas de nouvelles règles de déploiement.
