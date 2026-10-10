# ARCH — Architecture, maintenance et scripts

**Statut : proposé, non implémenté.** **Source :** audit statique de `dev` le 10/10/2026. **Responsable logique :** outillage + architecture. Les tâches ARCH concernent la structure, pas l'ajout de nouvelles fonctionnalités métier.

[Retour au TODO](../../TODO.md) · [Bot tactique](tactical-bot.md) · [Arbres de Candies](champion-enhancement-trees.md) · [Administration](admin-console.md)

## Invariants obligatoires

- [ ] Préserver les sauvegardes locales (`RUN_STORAGE_KEY`/`RUN_SCHEMA_VERSION`), les schémas RPC/RLS, le journal des commandes, les replays historiques et les hashes des bundles authority. Aucun déplacement ne doit changer le comportement sérialisé.
- [ ] Conserver `src/game` indépendant des composants React, stores Zustand et accès réseau : aucun import UI/DB dans le cœur déterministe.
- [ ] Ne jamais supprimer les bundles `supabase/authority-archive` parce qu'ils sont « vieux » : `unsupported` signifie hors déploiement, pas effaçable ; ne jamais recalculer un hash historique.
- [ ] Déployer `main` exclusivement vers LolRogue production et `dev` vers LolRogueDev ; toutes les autres branches bloquées par `backend:deploy`. Ne jamais afficher/exposer les secrets `service_role`.
- [ ] Garder les noms des required checks `validate`, `e2e`, `database` et `clean-room`, ainsi que les alias npm qui les alimentent, pendant la migration CI.
- [ ] Ne pas modifier en même temps l'architecture, l'algorithme du bot, les règles des arbres ou le modèle des récompenses : une PR = un groupe de responsabilités et des preuves de non-régression.

## ARCH-S1 — Catalogue de scripts et CLI (P2, taille L)

### ARCH-01 — Inventorier les scripts, propriétaires et appelants
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Extraire la liste des 105 entrées `scripts` de `package.json` ; classer usage courant, CI, déploiement, génération, maintenance, diagnostic, historique.
  - [ ] Scanner les références exactes à `npm run …` dans `.github/workflows`, `README.md`, `docs`, tests et scripts ; marquer « contrat externe » / « interne ».
  - [ ] Figer le périmètre des commandes publiques utilisées par développeurs, CI et release, sans supposer qu'un script absent de la recherche est inutile.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Identifier les scripts exposés mais jamais appelés ; vérifier leur utilité avant dépréciation. Ne pas confondre « non référencé » et « inutilisé ».
  - [ ] Publier un tableau ancien nom → nouvel appel → consommateurs → compatibilité prévue.
  - [ ] Produire un inventaire machine-readable `scripts-inventory.json` sous docs ou outillage avec propriétaire, risques, arguments et commande de remplacement.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Tester la présence des 105 entrées initiales dans l'inventaire, y compris hooks `prebuild`/`postbuild` et références indirectes.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-02 — Créer une CLI sans dépendance superflue
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Ajouter `scripts/cli.mjs` et des routeurs `scripts/commands/{balance,database,assets,release,testing}/` ; préserver le code des scripts métier existants.
  - [ ] Fournir `--help`, messages d'erreur utiles, validation des arguments et code de sortie non nul en cas d'échec.
  - [ ] Choisir une grammaire de sous-commandes et options sans ambiguïté (`--`, `--engine`, `--help`) et des erreurs structurées.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Définir les commandes canoniques : `balance -- baseline generate --engine v22`, `balance -- baseline check --all`, `balance -- check` et équivalents DB/assets.
  - [ ] Ajouter des tests CLI : aide, arguments invalides, sélection de version, erreurs propagées ; refuser les commandes silencieuses.
  - [ ] Conserver les appels Node avec propagation de `stdout`, `stderr` et du code de retour pour les commandes chaînées.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Tester appel valide, argument manquant, option inconnue, commande inexistante et interruption de sous-processus.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-03 — Réduire les commandes publiques et dédupliquer les versions
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Remplacer les alias `balance:baseline:generate:v15`…`v22` et `balance:early-top:generate:v17`… par des options `--engine` documentées.
  - [ ] Lire la version par défaut depuis `config/authority-versions.json` : la commande `generate` du moteur courant ne doit plus retomber sur `v21` pendant que `v22` est actif.
  - [ ] Lister explicitement les alias conservés provisoirement et la source de version canonique actuelle dans le registre.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Conserver temporairement `build`, `prebuild`, `postbuild`, `test`, `check`, `check:static`, `check:unit`, `check:db`, `check:browser`, `check:build`, `backend:deploy` et tous les noms appelés par CI/documentation.
  - [ ] Migrer tous les appelants en PR séparée, retirer les alias uniquement après recherche globale et CI verte ; viser environ 30–40 entrées npm publiques, sans en faire un critère artificiel.
  - [ ] Mettre un avertissement de dépréciation seulement après migration de tous les consommateurs et écrire la table d'équivalence.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Comparer génération/check sur moteurs v15 à v22 et vérifier que la version par défaut n'est pas silencieusement v21.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-04 — Sécuriser les scripts critiques
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Tester les modes lecture/`--check` sans modifier les fichiers suivis ; documenter précisément les générateurs qui écrivent volontairement.
  - [ ] Introduire `--dry-run`/confirmation explicite pour les commandes destructives, en respectant les contrats Supabase CLI existants.
  - [ ] Distinguer actions qui lisent, génèrent localement, détruisent ou déploient afin de définir le niveau de confirmation.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Distinguer scripts utilisés dans `postinstall`, génération à la demande et opérations distantes ; conserver le patch Supabase Auth tant qu'une preuve de retrait sûr manque.
  - [ ] Vérifier les chemins depuis la racine et l'exécution sous Node 24 sur Linux/macOS ; éviter `npx` non épinglé pour un outil sensible.
  - [ ] Faire échouer les commandes dangereuses avant le premier effet externe si cible, droits ou préconditions manquent.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Simuler branche interdite, CLI absente, échec patch Supabase et reset destructif sans toucher à une vraie base.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
**Acceptation S1 :** même sortie et mêmes artefacts pour les commandes existantes et nouvelles ; `npm ci`/CI ne régressent pas ; aucun nom de check GitHub requis n'est cassé.

## ARCH-S2 — Configuration et déploiement (P1, taille M/L)

### ARCH-05 — Source unique de configuration d'environnement
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Mutualiser les références publiques Supabase de `vite.config.ts` et `scripts/deploy-backend.mjs` dans un module compatible Node/Vite ; aucune clé privée versionnée.
  - [ ] Documenter les environnements local, preview `dev` et production `main`, ainsi que la provenance des variables Vercel.
  - [ ] Énumérer les variables autorisées au navigateur et la matrice environnement → branche → projet Supabase.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Vérifier que les builds preview `dev` ciblent toujours LolRogueDev même si des variables Preview globales ciblent la production.
  - [ ] Tester les erreurs de configuration (branche inconnue, SHA invalide, clés absentes, mélange de projets).
  - [ ] Supprimer les copies manuelles de refs sans toucher aux secrets, puis vérifier la priorité des variables Vercel.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Tester dev/prod/local, valeurs globales Preview contradictoires et clés manquantes ; confirmer aucune clé `service_role` dans `dist/`.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-06 — Protéger chaque commande DB distante
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Passer en revue `migrate`, `edge:deploy`, `backend:deploy`, commandes `--linked` et `--project-ref` ; expliciter quelles entrées peuvent atteindre la production.
  - [ ] Conserver le blocage `backend:deploy` hors `main`/`dev` et exiger une cible explicite contrôlée pour toute opération distancée ; ne pas transformer `db:reset` local en opération distante.
  - [ ] Qualifier chaque commande SQL/Edge de locale, liée au projet ou distante ; interdire les noms de cible implicites en prod.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Tester avec des faux exécutables/processus sans pousser de migration réelle ; consigner les cibles dans les logs sans secrets.
  - [ ] Vérifier ordre migration/Edge/frontend/rollout/rollback, en préservant les contrats authority existants.
  - [ ] Introduire un préflight qui vérifie branche, projet distant et confirmation avant opération mutable.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Rejouer `main`, `dev`, `feature/*`, detached HEAD et `--project-ref` incorrect dans des tests entièrement simulés.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-07 — Extraire les plugins Vite et les responsabilités Vitest
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Extraire les plugins internes d'injection d'identité, ressources PWA, assets Riot et catalogue champion dans `build/plugins/` ou `tooling/vite/`.
  - [ ] Séparer la configuration couverture Vitest des politiques de déploiement tout en maintenant les mêmes seuils, exclusions et budgets.
  - [ ] Recenser les plugins Vite et leurs entrées/sorties, plus les seuils Vitest existants avant extraction.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Vérifier octet par octet ou avec manifest/hash les fichiers produits : assets, méta-SHA, manifest, routes profondes.
  - [ ] Maintenir la règle actuelle `publicDir: false` et le pipeline d'assets intégrité Riot, sauf décision explicitement testée.
  - [ ] Déplacer à fonctionnalités identiques les plugins internes sans modifier l'ordre d'exécution ni les paths d'assets.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Comparer manifests, identité SHA, chemins PWA et chunks navigateur avant/après sur build propre.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
**Acceptation S2 :** matrices `dev`/`main`/branche interdite testées ; `check:build`, contrôles d'assets et tests de déploiement inchangés ; aucune fuite de `service_role`.

## ARCH-S3 — Frontières métier et stores (P2, taille L/XL)

### ARCH-08 — Cartographier les dépendances
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Générer la carte `pages → hooks → services → repositories` et les cycles éventuels, avec preuves par imports.
  - [ ] Définir une règle CI vérifiable : `src/game` n'importe ni `pages`, ni `stores`, ni `services/supabaseClient`.
  - [ ] Définir les couches permises et les exceptions d'import justifiées par le replay ou les interfaces communes.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Éviter les imports massifs via les barrels `src/services/index.ts` ; privilégier les entrées de domaine explicites.
  - [ ] Mesurer le graphe avant/après pour détecter les régressions réelles et éviter les renommages cosmétiques.
  - [ ] Mettre une règle automatique avec message indiquant l'import interdit et sa cible de remplacement.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Injecter un import React fictif dans `src/game` pour prouver que le test le détecte, puis restaurer.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-09 — Découper `runStoreLifecycleSlice.ts` (~41 Ko)
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Séparer les orchestrations `start`, `end/finalize`, `retry/save`, `sync progression` et `authority journal` des mutations Zustand.
  - [ ] Conserver les signatures publiques `useRunStore` et l'unique politique de persistance/merge ; aucune migration de sauvegarde sans test de migration.
  - [ ] Cartographier les transitions `start`, `save`, `retry`, `finalize`, `reload` et leurs effets observables.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Injecter les services/repositories au lieu de consulter plusieurs stores directement depuis des règles métier, lorsque possible.
  - [ ] Tester double clic, rechargement en sauvegarde, retry après réseau, run ancienne version et idempotence.
  - [ ] Déplacer orchestration dans des services réutilisables et laisser les slices Zustand gérer uniquement les mutations d'état.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Comparer snapshots legacy, appels concurrents de démarrage, rechargement en cours de sauvegarde et idempotence.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-10 — Stabiliser le conteneur de repositories
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Conserver `RepositoryContainer` et ses interfaces comme point d'accès DB ; éviter de créer un deuxième système DI parallèle.
  - [ ] Isoler le rafraîchissement des données serveur et l'état UI pour éviter qu'un service métier dépende directement des hooks/stores.
  - [ ] Lister interfaces réutilisées et contrats de dépendance du `RepositoryContainer` existant.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Vérifier auth/RLS et contrats de sérialisation avec tests base réelle ; maintenir le mode invité sans DB.
  - [ ] Éviter de déplacer ou modifier les méthodes de repositories sans consommateurs/tests mis à jour.
  - [ ] Introduire injection explicite dans les services critiques, sans multiplier les conteneurs ou clients Supabase.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Tester invités hors ligne, droits connectés, refus RLS et refresh de progression avec identité changée.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-11 — Contrats de données et invariants
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Documenter la propriété de chaque type : catalogue champion, instance de combat, état run, tentative authority, progression de compte et devise.
  - [ ] Ajouter des tests de frontières et d'import ; suivre explicitement schémas générés `src/types/database.ts` versus modèles métiers.
  - [ ] Faire une matrice d'appartenance pour types UI, modèles DB, contrats authority et données jeu immuables.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Éviter la création de types en double entre `src/types`, `src/game` et `src/features` ; rediriger progressivement vers des exports stables.
  - [ ] Remplacer les duplications par des imports explicites, en gardant les adaptateurs de compatibilité existants.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Contrôler compilations app/scripts/e2e et migration des snapshots sans conversion de nombres ou enums.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
**Acceptation S3 :** sauvegardes anciennes restaurées, composants inchangés extérieurement, invariants authoritative conservés et aucune nouvelle dépendance circulaire.

## ARCH-S4 — Modules UI orientés fonctionnalités (P2, taille XL)

### ARCH-12 — Migrer par tranche, pas par renommage global
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Introduire progressivement `src/features/{combat,champions,champion-economy,progression,runs,daily,inventory,authentication,administration}`.
  - [ ] Conserver `src/game/{battle,authority,rules,effects,map,balance}` ; déplacer seulement l'UI et les orchestrations concernées.
  - [ ] Choisir un seul module pilote et mesurer ses consommateurs avant déplacement ; documenter l'API publique.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Introduire `src/shared/{ui,i18n,styles,assets,utils}` et `src/infrastructure/{supabase,repositories,persistence,observability}` uniquement lorsqu'un module en a besoin.
  - [ ] Ne pas casser les imports historiques d'un coup ; tests et builds après chaque déplacement.
  - [ ] Migrer imports par petites PR sans créer une structure miroir qui double stores, services ou règles.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Vérifier l'absence d'imports résiduels, builds navigateur, routes et bundle size à chaque étape.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-13 — Alléger `CombatPage.tsx` (~39 Ko)
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Extraire un hook/contrôleur des décisions UI : sélection des actions et cibles, autoplay, statut du combat, effets visuels.
  - [ ] Conserver validations dans `BattleActionValidator` et calculs dans le moteur, pas de règles dupliquées en JSX.
  - [ ] Recenser les actions UI versus règles métier, y compris ciblage, autoplay, délais et états chargés.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Tester manuel/auto, contrôles clavier/tactile, multi-cibles, refresh et authority.
  - [ ] Coordonner cette extraction avec `AI-001` et suivants : l'IA reste dans le moteur et ne dépend pas du contrôleur React.
  - [ ] Extraire un contrôleur UI sans remplacer le validateur canonique ni appliquer deux fois une action.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Tester combat manuel, auto ×1/×2/×3, cible alliée/ennemie et reprise après navigation.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-14 — Alléger `StarterSelectPage.tsx` (~31 Ko)
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Extraire la préparation de run et la sélection du mode Daily/standard, filtres du catalogue, affichage de l'économie.
  - [ ] Remplacer l'instanciation directe de `SupabaseDailyRunRepository` dans la page par une orchestration testable et des interfaces existantes.
  - [ ] Définir séparément les contrats de sélection de champion, filtrage, mode Daily et accès économique.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Vérifier modes invité/connecté, choix des champions, roster acheté/rotation, rechargement et i18n.
  - [ ] Introduire un service/app hook unique pour le Daily au lieu de `new SupabaseDailyRunRepository` depuis JSX.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Tester champion gratuit/acheté/rotation, invité, erreur réseau, persistance et navigation vers run.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-15 — Refactor moteur `BattleManager`/`AuthorityRunEngine` sous contrat
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Extraire en petites unités les résolveurs/gestionnaires déjà identifiés sans changer ordre RNG, ordre événements ni sérialisation.
  - [ ] Ne modifier le moteur autoritaire courant qu'avec versioning/parité si la sémantique change ; jamais réécrire un bundle `replay-only` ou `unsupported`.
  - [ ] Repérer les étapes pures et l'ordre exact de consommation RNG avant tout déplacement de résolveur.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Ajouter tests de snapshots/replay/seed et comparer sortie des builds avec les fixtures avant/après.
  - [ ] Isoler les résolveurs en maintenant l'ordre des callbacks et le format de chaque commande autoritaire.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Comparer traces octet à octet, seeds versionnées, snapshots de versions historiques et rapports de cohorte.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
**Acceptation S4 :** UX inchangée, modules autonomes, testabilité augmentée, pas de divergence client/authority.

## ARCH-S5 — Artefacts, CSS et dette suivie (P2, taille M/L)

### ARCH-16 — Classer les fichiers générés
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Définir pour `src/data/generated`, `config`, bundles authority, types DB et `public/assets` : source, commande de génération, contrôle d'intégrité, politique Git et consommateur.
  - [ ] Vérifier pourquoi `run-authority.bundle.js` apparaît suivi malgré sa règle `.gitignore` ; conserver sa présence si nécessaire au registre/gates.
  - [ ] Identifier la source-of-truth, le générateur, la rétention et les références croisées de chaque artefact.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Ne supprimer aucun bundle/version de DB/archive sans matrice de compatibilité et tests.
  - [ ] Ranger les rapports temporaires dans les répertoires ignorés appropriés ; pas de snapshots bruyants dans le backlog actif.
  - [ ] Ajouter une vérification de dérive en lecture seule plutôt qu'une suppression automatisée des archives.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Tester build neuf depuis clone sans cache et comparaison des hashes d'authority archivés.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-17 — Rationaliser CSS et composants
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Cartographier les 26 feuilles sous `src/styles` et les doublons de tokens/composants ; relever spécificité et dépendances aux imports.
  - [ ] Garder les variables de design, accessibilité, réduction d'animation, focus et responsive ; mutualiser seulement après vérification visuelle.
  - [ ] Inventorier variables CSS, cascade, styles importés par page et comportements mobile/accessibilité.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Ne pas ajouter un deuxième design system durant la refonte admin/arbre ; réutiliser `shared/ui`.
  - [ ] Mutualiser des tokens uniquement après preuve de parité visuelle, sans retoucher le moteur ni les données.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Captures desktop/mobile, focus visible, zoom 400 %, reduced-motion et contrastes comparés avant/après.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.### ARCH-18 — Audit des dépendances et qualité
- [ ] **Définir le contrat et les cas à couvrir.**
  - [ ] Vérifier packages directs/indirects, versions épinglées, patch Supabase Auth, imports morts et scripts non référencés ; ne retirer que sur preuve.
  - [ ] Faire passer `npm ci`, `npm run check`, `npm run check:db`, `npm run check:browser`, `npm run balance:check` et workflows spécialisés pertinents.
  - [ ] Fixer une baseline mesurée des temps CI, tailles de bundles et dépendances utilisées.
  - [ ] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [ ] **Réaliser les changements et conserver les compatibilités.**
  - [ ] Documenter avant/après : temps d'installation, durée de CI, taille bundle navigateur/Edge, nombre de scripts npm, fichiers couplés.
  - [ ] Mettre à jour `README.md` et docs d'exploitation, et archiver les seuls éléments effectivement terminés.
  - [ ] Retirer une dépendance seulement après recherche d'import runtime/script et remplacement du patch si applicable.
  - [ ] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [ ] Vérifier audit, compilation et CI propre puis documenter gains chiffrés et éventuels compromis.
  - [ ] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [ ] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
**Acceptation générale ARCH :** aucune fonctionnalité perdue, pas de changement silencieux de contrat de déploiement/authority ; démonstration chiffrée de la simplification.

## Interfaces et doublons évités

- `ARCH-13` extrait le contrôleur combat ; `AI-001..049` conçoit **la politique de décision**, sans dupliquer l'UI.
- `ARCH-14` et `ADM-31..36` réutilisent les mêmes patterns UI, mais les modules admin appartiennent au domaine administration.
- `ARCH-16` conserve les historiques authority : la décision de désactiver des versions est traitée par `docs/authority-versioning.md`, pas par nettoyage de fichiers.
- `ARCH-05/06` sont les uniques propriétaires du routage environnement ; les autres sprints n'ajoutent pas de nouvelles règles de déploiement.
