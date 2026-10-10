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
- [ ] Extraire la liste des 105 entrées `scripts` de `package.json` ; classer usage courant, CI, déploiement, génération, maintenance, diagnostic, historique.
- [ ] Scanner les références exactes à `npm run …` dans `.github/workflows`, `README.md`, `docs`, tests et scripts ; marquer « contrat externe » / « interne ».
- [ ] Identifier les scripts exposés mais jamais appelés ; vérifier leur utilité avant dépréciation. Ne pas confondre « non référencé » et « inutilisé ».
- [ ] Publier un tableau ancien nom → nouvel appel → consommateurs → compatibilité prévue.

### ARCH-02 — Créer une CLI sans dépendance superflue
- [ ] Ajouter `scripts/cli.mjs` et des routeurs `scripts/commands/{balance,database,assets,release,testing}/` ; préserver le code des scripts métier existants.
- [ ] Fournir `--help`, messages d'erreur utiles, validation des arguments et code de sortie non nul en cas d'échec.
- [ ] Définir les commandes canoniques : `balance -- baseline generate --engine v22`, `balance -- baseline check --all`, `balance -- check` et équivalents DB/assets.
- [ ] Ajouter des tests CLI : aide, arguments invalides, sélection de version, erreurs propagées ; refuser les commandes silencieuses.

### ARCH-03 — Réduire les commandes publiques et dédupliquer les versions
- [ ] Remplacer les alias `balance:baseline:generate:v15`…`v22` et `balance:early-top:generate:v17`… par des options `--engine` documentées.
- [ ] Lire la version par défaut depuis `config/authority-versions.json` : la commande `generate` du moteur courant ne doit plus retomber sur `v21` pendant que `v22` est actif.
- [ ] Conserver temporairement `build`, `prebuild`, `postbuild`, `test`, `check`, `check:static`, `check:unit`, `check:db`, `check:browser`, `check:build`, `backend:deploy` et tous les noms appelés par CI/documentation.
- [ ] Migrer tous les appelants en PR séparée, retirer les alias uniquement après recherche globale et CI verte ; viser environ 30–40 entrées npm publiques, sans en faire un critère artificiel.

### ARCH-04 — Sécuriser les scripts critiques
- [ ] Tester les modes lecture/`--check` sans modifier les fichiers suivis ; documenter précisément les générateurs qui écrivent volontairement.
- [ ] Introduire `--dry-run`/confirmation explicite pour les commandes destructives, en respectant les contrats Supabase CLI existants.
- [ ] Distinguer scripts utilisés dans `postinstall`, génération à la demande et opérations distantes ; conserver le patch Supabase Auth tant qu'une preuve de retrait sûr manque.
- [ ] Vérifier les chemins depuis la racine et l'exécution sous Node 24 sur Linux/macOS ; éviter `npx` non épinglé pour un outil sensible.

**Acceptation S1 :** même sortie et mêmes artefacts pour les commandes existantes et nouvelles ; `npm ci`/CI ne régressent pas ; aucun nom de check GitHub requis n'est cassé.

## ARCH-S2 — Configuration et déploiement (P1, taille M/L)

### ARCH-05 — Source unique de configuration d'environnement
- [ ] Mutualiser les références publiques Supabase de `vite.config.ts` et `scripts/deploy-backend.mjs` dans un module compatible Node/Vite ; aucune clé privée versionnée.
- [ ] Documenter les environnements local, preview `dev` et production `main`, ainsi que la provenance des variables Vercel.
- [ ] Vérifier que les builds preview `dev` ciblent toujours LolRogueDev même si des variables Preview globales ciblent la production.
- [ ] Tester les erreurs de configuration (branche inconnue, SHA invalide, clés absentes, mélange de projets).

### ARCH-06 — Protéger chaque commande DB distante
- [ ] Passer en revue `migrate`, `edge:deploy`, `backend:deploy`, commandes `--linked` et `--project-ref` ; expliciter quelles entrées peuvent atteindre la production.
- [ ] Conserver le blocage `backend:deploy` hors `main`/`dev` et exiger une cible explicite contrôlée pour toute opération distancée ; ne pas transformer `db:reset` local en opération distante.
- [ ] Tester avec des faux exécutables/processus sans pousser de migration réelle ; consigner les cibles dans les logs sans secrets.
- [ ] Vérifier ordre migration/Edge/frontend/rollout/rollback, en préservant les contrats authority existants.

### ARCH-07 — Extraire les plugins Vite et les responsabilités Vitest
- [ ] Extraire les plugins internes d'injection d'identité, ressources PWA, assets Riot et catalogue champion dans `build/plugins/` ou `tooling/vite/`.
- [ ] Séparer la configuration couverture Vitest des politiques de déploiement tout en maintenant les mêmes seuils, exclusions et budgets.
- [ ] Vérifier octet par octet ou avec manifest/hash les fichiers produits : assets, méta-SHA, manifest, routes profondes.
- [ ] Maintenir la règle actuelle `publicDir: false` et le pipeline d'assets intégrité Riot, sauf décision explicitement testée.

**Acceptation S2 :** matrices `dev`/`main`/branche interdite testées ; `check:build`, contrôles d'assets et tests de déploiement inchangés ; aucune fuite de `service_role`.

## ARCH-S3 — Frontières métier et stores (P2, taille L/XL)

### ARCH-08 — Cartographier les dépendances
- [ ] Générer la carte `pages → hooks → services → repositories` et les cycles éventuels, avec preuves par imports.
- [ ] Définir une règle CI vérifiable : `src/game` n'importe ni `pages`, ni `stores`, ni `services/supabaseClient`.
- [ ] Éviter les imports massifs via les barrels `src/services/index.ts` ; privilégier les entrées de domaine explicites.
- [ ] Mesurer le graphe avant/après pour détecter les régressions réelles et éviter les renommages cosmétiques.

### ARCH-09 — Découper `runStoreLifecycleSlice.ts` (~41 Ko)
- [ ] Séparer les orchestrations `start`, `end/finalize`, `retry/save`, `sync progression` et `authority journal` des mutations Zustand.
- [ ] Conserver les signatures publiques `useRunStore` et l'unique politique de persistance/merge ; aucune migration de sauvegarde sans test de migration.
- [ ] Injecter les services/repositories au lieu de consulter plusieurs stores directement depuis des règles métier, lorsque possible.
- [ ] Tester double clic, rechargement en sauvegarde, retry après réseau, run ancienne version et idempotence.

### ARCH-10 — Stabiliser le conteneur de repositories
- [ ] Conserver `RepositoryContainer` et ses interfaces comme point d'accès DB ; éviter de créer un deuxième système DI parallèle.
- [ ] Isoler le rafraîchissement des données serveur et l'état UI pour éviter qu'un service métier dépende directement des hooks/stores.
- [ ] Vérifier auth/RLS et contrats de sérialisation avec tests base réelle ; maintenir le mode invité sans DB.
- [ ] Éviter de déplacer ou modifier les méthodes de repositories sans consommateurs/tests mis à jour.

### ARCH-11 — Contrats de données et invariants
- [ ] Documenter la propriété de chaque type : catalogue champion, instance de combat, état run, tentative authority, progression de compte et devise.
- [ ] Ajouter des tests de frontières et d'import ; suivre explicitement schémas générés `src/types/database.ts` versus modèles métiers.
- [ ] Éviter la création de types en double entre `src/types`, `src/game` et `src/features` ; rediriger progressivement vers des exports stables.

**Acceptation S3 :** sauvegardes anciennes restaurées, composants inchangés extérieurement, invariants authoritative conservés et aucune nouvelle dépendance circulaire.

## ARCH-S4 — Modules UI orientés fonctionnalités (P2, taille XL)

### ARCH-12 — Migrer par tranche, pas par renommage global
- [ ] Introduire progressivement `src/features/{combat,champions,champion-economy,progression,runs,daily,inventory,authentication,administration}`.
- [ ] Conserver `src/game/{battle,authority,rules,effects,map,balance}` ; déplacer seulement l'UI et les orchestrations concernées.
- [ ] Introduire `src/shared/{ui,i18n,styles,assets,utils}` et `src/infrastructure/{supabase,repositories,persistence,observability}` uniquement lorsqu'un module en a besoin.
- [ ] Ne pas casser les imports historiques d'un coup ; tests et builds après chaque déplacement.

### ARCH-13 — Alléger `CombatPage.tsx` (~39 Ko)
- [ ] Extraire un hook/contrôleur des décisions UI : sélection des actions et cibles, autoplay, statut du combat, effets visuels.
- [ ] Conserver validations dans `BattleActionValidator` et calculs dans le moteur, pas de règles dupliquées en JSX.
- [ ] Tester manuel/auto, contrôles clavier/tactile, multi-cibles, refresh et authority.
- [ ] Coordonner cette extraction avec `AI-001` et suivants : l'IA reste dans le moteur et ne dépend pas du contrôleur React.

### ARCH-14 — Alléger `StarterSelectPage.tsx` (~31 Ko)
- [ ] Extraire la préparation de run et la sélection du mode Daily/standard, filtres du catalogue, affichage de l'économie.
- [ ] Remplacer l'instanciation directe de `SupabaseDailyRunRepository` dans la page par une orchestration testable et des interfaces existantes.
- [ ] Vérifier modes invité/connecté, choix des champions, roster acheté/rotation, rechargement et i18n.

### ARCH-15 — Refactor moteur `BattleManager`/`AuthorityRunEngine` sous contrat
- [ ] Extraire en petites unités les résolveurs/gestionnaires déjà identifiés sans changer ordre RNG, ordre événements ni sérialisation.
- [ ] Ne modifier le moteur autoritaire courant qu'avec versioning/parité si la sémantique change ; jamais réécrire un bundle `replay-only` ou `unsupported`.
- [ ] Ajouter tests de snapshots/replay/seed et comparer sortie des builds avec les fixtures avant/après.

**Acceptation S4 :** UX inchangée, modules autonomes, testabilité augmentée, pas de divergence client/authority.

## ARCH-S5 — Artefacts, CSS et dette suivie (P2, taille M/L)

### ARCH-16 — Classer les fichiers générés
- [ ] Définir pour `src/data/generated`, `config`, bundles authority, types DB et `public/assets` : source, commande de génération, contrôle d'intégrité, politique Git et consommateur.
- [ ] Vérifier pourquoi `run-authority.bundle.js` apparaît suivi malgré sa règle `.gitignore` ; conserver sa présence si nécessaire au registre/gates.
- [ ] Ne supprimer aucun bundle/version de DB/archive sans matrice de compatibilité et tests.
- [ ] Ranger les rapports temporaires dans les répertoires ignorés appropriés ; pas de snapshots bruyants dans le backlog actif.

### ARCH-17 — Rationaliser CSS et composants
- [ ] Cartographier les 26 feuilles sous `src/styles` et les doublons de tokens/composants ; relever spécificité et dépendances aux imports.
- [ ] Garder les variables de design, accessibilité, réduction d'animation, focus et responsive ; mutualiser seulement après vérification visuelle.
- [ ] Ne pas ajouter un deuxième design system durant la refonte admin/arbre ; réutiliser `shared/ui`.

### ARCH-18 — Audit des dépendances et qualité
- [ ] Vérifier packages directs/indirects, versions épinglées, patch Supabase Auth, imports morts et scripts non référencés ; ne retirer que sur preuve.
- [ ] Faire passer `npm ci`, `npm run check`, `npm run check:db`, `npm run check:browser`, `npm run balance:check` et workflows spécialisés pertinents.
- [ ] Documenter avant/après : temps d'installation, durée de CI, taille bundle navigateur/Edge, nombre de scripts npm, fichiers couplés.
- [ ] Mettre à jour `README.md` et docs d'exploitation, et archiver les seuls éléments effectivement terminés.

**Acceptation générale ARCH :** aucune fonctionnalité perdue, pas de changement silencieux de contrat de déploiement/authority ; démonstration chiffrée de la simplification.

## Interfaces et doublons évités

- `ARCH-13` extrait le contrôleur combat ; `AI-001..049` conçoit **la politique de décision**, sans dupliquer l'UI.
- `ARCH-14` et `ADM-31..36` réutilisent les mêmes patterns UI, mais les modules admin appartiennent au domaine administration.
- `ARCH-16` conserve les historiques authority : la décision de désactiver des versions est traitée par `docs/authority-versioning.md`, pas par nettoyage de fichiers.
- `ARCH-05/06` sont les uniques propriétaires du routage environnement ; les autres sprints n'ajoutent pas de nouvelles règles de déploiement.
