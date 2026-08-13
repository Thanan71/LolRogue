# TODO — audit complet et backlog courant de LolRogue

Dernier réaudit : **8 août 2026, 18:37 CEST**.

Ce fichier remplace l'ancien TODO historique. Son snapshot exact est conservé dans
[`docs/archive/todo-snapshot-2026-08-08-1837.md`](docs/archive/todo-snapshot-2026-08-08-1837.md).

Le but de ce document est simple : **ne contenir que des actions encore utiles**.
Les travaux déjà livrés restent documentés dans l'historique Git, `docs/feature-status.md`
et les archives ; ils ne sont pas recopiés ici sous forme de centaines de cases cochées.

---

## 0. Périmètre du réaudit

Le réaudit a recoupé :

- `main` après les correctifs authority v13 et historique de runs ;
- la configuration Node / TypeScript / Vite / Vitest / Playwright / Biome ;
- `.github/workflows/ci.yml` ;
- les budgets de bundle et la vérification du déploiement ;
- le contrat d'autorité des runs et la persistance ;
- les repositories Supabase et leurs tests ;
- les documents `feature-status`, `beta-readiness`, `dependency-audit`, légal et exploitation ;
- le schéma **Supabase live** du projet `LolRogue` ;
- les advisors sécurité et performance Supabase live ;
- les grants, vues et fonctions `SECURITY DEFINER` live ;
- l'état des migrations live et les tentatives de run récentes.

### Constats live majeurs du 8 août 2026

1. `public.leaderboard` et `public.daily_leaderboard` sont encore créées avec
   `security_invoker=false`. Supabase les signale comme **ERROR** de sécurité.
2. Plusieurs fonctions `SECURITY DEFINER` ont une surface `EXECUTE` plus large que
   nécessaire. Certaines sont intentionnellement appelées par les clients, d'autres non.
3. `handle_new_user()` est une fonction de trigger mais reste appelable directement
   par `anon` et `authenticated`.
4. `is_current_user_admin()` reste appelable par `anon` alors que ce rôle n'en a pas besoin.
5. `expire_stale_run_attempts()` est exposée directement aux utilisateurs authentifiés
   alors que l'expiration peut être intégrée aux RPC de démarrage.
6. La protection Supabase contre les mots de passe compromis est désactivée.
7. Le purgeur de logs est planifié par `pg_cron`, mais `purge_expired_social_data()`
   n'a actuellement **aucune tâche cron** malgré la politique de rétention documentée.
8. Les 7 derniers jours montrent 4 attempts `verified` et 4 attempts `rejected` avec
   `pending_choice`. Ces rejets correspondent au bug authority v13 corrigé aujourd'hui,
   mais montrent que la détection opérationnelle est insuffisante.
9. Le bug `progression_ruleset_version` a prouvé qu'un repository peut compiler et
   passer ses mocks tout en envoyant une requête PostgREST invalide à la base réelle.
10. Le runtime déclaré est Node 24 alors que `@types/node` est en majeure 26.
11. `test:db` énumère manuellement les fichiers DB ; un nouveau test peut donc être
    ajouté sans être exécuté par cette gate.
12. `test:deployed-assets` utilise `https://lol-rogue.vercel.app` si
    `DEPLOYMENT_URL` n'est pas fourni : sur une PR, cette validation peut donc tester
    la production au lieu du commit en cours.
13. Les advisors performance signalent plusieurs foreign keys sans index couvrant.
14. `docs/beta-readiness.md` affirme encore qu'aucun P0 n'est ouvert et que les
    10/10 gates techniques sont démontrés ; ce statut doit être recalculé après ce réaudit.

---

## 1. Convention du backlog

### Priorités

- **P0 — bloquant** : risque de sécurité, autorité, perte/corruption de progression,
  ou gate de release donnant une fausse assurance. À fermer avant toute bêta publique.
- **P1 — important** : fiabilité, confidentialité, CI, compatibilité runtime ou
  exploitabilité. À fermer avant de considérer le produit stable.
- **P2 — qualité** : performance, dette, couverture, durcissement, maintenabilité.
- **P3 — évolution** : enrichissement produit ou amélioration non nécessaire à la
  sécurité/stabilité immédiate.

### Taille indicative

- **S** : quelques heures ;
- **M** : environ 1–2 jours de travail concentré ;
- **L** : plusieurs jours, migration ou refonte transverse.

### Définition de Done obligatoire

Une tâche n'est terminée que lorsque :

- le comportement réel est corrigé, pas uniquement le mock ;
- la migration est append-only si la base est concernée ;
- les permissions finales sont testées avec les rôles concernés ;
- un test échoue sans le correctif et passe avec lui ;
- les erreurs / doubles appels / refresh / retry sont testés quand pertinents ;
- les types générés et le schéma appliqué restent synchronisés ;
- la documentation qui prétend un statut est mise à jour ;
- les CI pertinentes passent sur un clone propre ;
- une preuve de validation est conservée dans la PR/commit ou la fiche de release.

---

# P0 — sécurité, autorité et release gates

## P0-SEC-01 — Corriger les vues leaderboard `SECURITY DEFINER`

**Taille : M**  
**Risque : élevé — données publiques / contournement potentiel de RLS.**

### Problème vérifié

Supabase live signale :

- `public.leaderboard` : `security_invoker=false` ;
- `public.daily_leaderboard` : `security_invoker=false`.

Les deux vues sont lisibles par `anon` et `authenticated`. Leur contrat de colonnes
est volontairement minimal, mais elles s'exécutent actuellement avec les permissions
du propriétaire de la vue.

### Actions

- [x] Créer une migration append-only qui recrée les deux vues avec
  `WITH (security_invoker = true, security_barrier = true)` **si** les politiques
  sous-jacentes permettent toujours le contrat attendu.
- [x] Si `security_invoker=true` empêche légitimement la lecture publique, déplacer
  la logique de publication dans une vue/table dédiée dont les données sont déjà
  sanitisées, ou une RPC publique minimale explicitement auditée.
- [x] Ne pas résoudre le problème en ajoutant des `SELECT` larges sur `players` ou
  `daily_runs`.
- [x] Revalider le champ public exact de chaque vue : aucune adresse e-mail,
  `user_id`, `player_id`, dernière connexion, candies privées, raison de modération
  ou métadonnée interne.
- [x] Ajouter des tests SQL pour `anon`, `authenticated` et propriétaire :
  lecture autorisée uniquement sur le contrat public ; lecture directe des tables
  privées refusée.
- [x] Ajouter une assertion automatisée sur `pg_class.reloptions` pour empêcher le
  retour de `security_invoker=false`.
- [x] Faire échouer `db:validate` si l'advisor `security_definer_view` réapparaît.

### Fichiers / zones

- `supabase/migrations/*social*`
- migrations créant `leaderboard` / `daily_leaderboard`
- `tests/schema.database.test.ts`
- `tests/authoritativeDaily.database.test.ts`
- `tests/socialLeaderboardContract.test.ts`

### Acceptation

- advisor Supabase : **0 `security_definer_view` ERROR** ;
- les classements publics continuent à fonctionner en invité ;
- aucun accès public direct aux tables privées n'est ajouté.

---

## P0-SEC-02 — Réduire et formaliser la surface `SECURITY DEFINER`

**Taille : L**  
**Risque : élevé — fonctions privilégiées exposées via PostgREST.**

### Problème vérifié

La base live possède plusieurs fonctions `SECURITY DEFINER` exécutables par des
rôles clients. Toutes ont déjà `search_path=''`, ce qui est positif, mais les grants
ne sont pas minimalistes.

### Catégorisation à appliquer

**Doivent rester client-callable après audit, avec contrôle interne explicite :**

- `start_run_attempt`
- `start_daily_run_attempt`
- `append_run_attempt_commands`
- `seal_run_attempt`
- `get_run_attempt_status`
- `unlock_champion_enhancement`
- `submit_client_logs`
- `set_leaderboard_privacy`
- `get_my_leaderboard_rank`
- `report_daily_score`
- `invalidate_daily_score` uniquement si la route admin l'utilise directement et
  si `is_current_user_admin()` est systématiquement imposé.

**À réexaminer / réduire :**

- `handle_new_user()` : trigger interne, pas une API ;
- `is_current_user_admin()` : `anon` n'a pas besoin de l'exécuter ;
- `expire_stale_run_attempts()` : peut être absorbée par les RPC de start ;
- `purge_expired_social_data()` : maintenance, pas une API utilisateur ordinaire ;
- `touch_player_last_login()` : vérifier qu'une mutation directe n'est pas
  remplaçable par le flux Auth serveur.

### Actions

- [x] Créer un **manifest de privilèges attendu** (fonction, rôle, justification).
- [x] Révoquer `EXECUTE` à `PUBLIC` avant de réaccorder les seules fonctions voulues.
- [x] Révoquer explicitement `anon, authenticated` sur `handle_new_user()`.
- [x] Révoquer `anon` sur `is_current_user_admin()`.
- [x] Déplacer `purge_expired_social_data()` vers une exécution `service_role` /
  cron et révoquer `authenticated` si l'UI n'en a pas besoin.
- [x] Intégrer l'expiration des attempts dans `start_run_attempt` /
  `start_daily_run_attempt`, puis retirer l'appel client à `expire_stale_run_attempts`.
- [x] Pour chaque RPC restant `SECURITY DEFINER`, tester : identité absente,
  identité différente, ID d'une autre ressource, payload extrême, double appel,
  ownership et erreur attendue.
- [x] Vérifier qu'aucune fonction privilégiée ne prend une décision d'autorisation
  depuis `raw_user_meta_data` / `user_metadata`.
- [x] Ajouter une gate SQL qui compare les grants live/local au manifest attendu.
- [x] Documenter les warnings Supabase volontairement acceptés, un par un, au lieu
  de considérer toute alerte comme un faux positif global.

### Acceptation

Un diff de privilèges doit montrer uniquement les RPC nécessaires au client.
Aucune fonction de trigger ou de maintenance ne doit être appelable par le navigateur.

---

## P0-RUN-01 — Supprimer la duplication manuelle des versions authority

**Taille : M**  
**Risque : élevé — rejet silencieux de progression.**

### Incident observé

`run-engine-v13` avait été ajouté au serveur mais oublié dans
`CANONICAL_PROGRESSION_ENGINES` côté client. Le client ne générait donc pas le choix
d'augment de transition alors que le replay serveur l'exigeait. Quatre attempts
récentes ont été rejetées avec `pending_choice`.

Le test de non-régression ajouté aujourd'hui protège le moteur courant, mais la
structure reste fragile : une liste de chaînes doit encore être maintenue à la main.

### Actions

- [x] Créer un registre unique des versions authority : version moteur, version
  gameplay, version progression, version commande, capacités et statut
  (`current`, `replay-only`, `unsupported`).
- [x] Faire consommer ce registre par le client, l'authority, les scripts de bundle,
  les tests et la documentation.
- [x] Remplacer `CANONICAL_PROGRESSION_ENGINES` par une capacité déclarative, par
  exemple `features.canonicalProgression`.
- [x] Refuser au build une version courante absente du registre.
- [x] Vérifier que chaque bundle de replay historique possède une entrée compatible.
- [x] Ajouter un test qui itère toutes les versions supportées, pas seulement
  `AUTHORITY_ENGINE_VERSION`.
- [x] Ajouter une golden trace de transition de biome pour chaque famille de
  progression encore rejouable.
- [x] Interdire la publication d'un nouveau ruleset si client + serveur + bundle
  historique n'ont pas la même métadonnée de capacité.

### Acceptation

Passer de v13 à v14 ne doit nécessiter **aucune modification d'une liste parallèle**.
Une incohérence de version doit casser le build/CI avant déploiement.

---

## P0-DATA-01 — Tester les repositories contre une vraie base

**Taille : L**  
**Risque : élevé — erreur 400 seulement visible en production.**

### Incident observé

`SupabaseRunRepository.getPlayerRunHistory()` demandait
`progression_ruleset_version`, absent de `run_attempts`. Les tests mocks reproduisaient
la même fausse colonne et passaient. PostgREST renvoyait ensuite `400 Bad Request`.

### Actions

- [x] Conserver le test de contrat unitaire ajouté aujourd'hui, mais ne pas le
  considérer suffisant.
- [x] Ajouter une suite `repositoryIntegration.database.test.ts` utilisant le vrai
  Supabase local après migrations.
- [x] Exercices minimum : historique de runs + nested FK, profil, leaderboard,
  Daily, maîtrise, enhancements, admin et logs.
- [x] Insérer des fixtures minimales via service role, puis appeler les repositories
  avec un client `anon` / `authenticated` réel.
- [x] Vérifier les noms de relations PostgREST et les nested selects réels.
- [x] Tester les erreurs `PGRST*` et les réponses nulles réelles.
- [x] Ajouter ces tests à `test:db` sans liste manuelle de fichiers.
- [x] Ajouter un contrôle de dérive : migrations du dépôt ↔ types générés ↔ schéma
  local ↔ migrations appliquées en production.
- [x] Avant release, comparer la dernière version de `supabase_migrations` live à la
  dernière migration attendue par le commit candidat.
- [x] Interdire les casts `as unknown as ...` destinés à masquer une forme PostgREST
  non vérifiée dans les repositories critiques ; si un cast est indispensable,
  l'accompagner d'un parseur runtime.

### Acceptation

Renommer/supprimer une colonne réellement sélectionnée doit faire échouer la CI DB,
avant le build de production.

---

## P0-REL-01 — Réparer la gate bêta pour qu'elle reflète l'état réel

**Taille : M**  
**Risque : élevé — faux sentiment de readiness.**

### Problème

`docs/beta-readiness.md` affirme encore :

- « Aucun P0 ouvert » ;
- « dix critères techniques démontrés » ;
- trois CI historiques validées.

Le réaudit live a rouvert des P0. Une gate ne doit pas rester verte parce qu'elle
référence des commits antérieurs à de nouveaux incidents.

### Actions

- [x] Passer immédiatement le statut bêta à **bloqué** tant que les P0 ci-dessus
  ne sont pas clos.
- [x] Ne plus utiliser la présence de `[x]` dans `TODO.md` comme preuve.
- [x] Faire dériver la gate de checks exécutables : CI du commit candidat, advisors,
  migrations live, tests DB, E2E, sécurité des views/grants et validation externe.
- [x] Exiger trois CI **postérieures au dernier correctif P0**, pas trois CI historiques.
- [x] Stocker dans la fiche de release le SHA exact testé, l'URL preview et la version
  de migration live.
- [x] Ajouter un script `release:preflight` qui échoue si un P0 reste ouvert ou si
  les docs de readiness contredisent les checks.
- [x] Mettre à jour `docs/feature-status.md` : « livré » ne doit pas signifier
  « aucun risque courant ».

### Acceptation

La documentation doit devenir rouge automatiquement lorsqu'une gate objective
échoue, même si le sujet avait été déclaré terminé dans un audit précédent.

---

# P1 — sécurité et confidentialité

## P1-SEC-01 — Activer la protection contre les mots de passe compromis

**Taille : S**

- [ ] Activer **Leaked Password Protection** dans Supabase Auth.
- [ ] Vérifier la politique minimale de longueur/complexité et les messages UI.
- [ ] Tester inscription et changement de mot de passe avec un mot de passe refusé.
- [ ] Documenter le réglage dans les runbooks d'environnement.
- [ ] Ajouter ce paramètre à la checklist de création/restauration d'un projet Supabase.

**Acceptation :** l'advisor `auth_leaked_password_protection` ne doit plus apparaître.

---

## P1-SEC-02 — Auditer les fonctions admin privilégiées

**Taille : M**

- [x] Vérifier que `players.is_admin` ne peut jamais être modifié par le propriétaire
  du profil via table, RPC générique ou metadata Auth.
- [x] Tester `invalidate_daily_score` avec utilisateur normal, admin et anon.
- [x] Tester qu'un admin ne peut invalider qu'un score existant et que le motif est
  borné/sanitisé.
- [x] Conserver une piste d'audit immutable de l'invalidation.
- [x] Vérifier que `is_current_user_admin()` n'expose aucune information utile à un
  utilisateur non authentifié.
- [x] Documenter une procédure de promotion/révocation admin hors client public.

---

## P1-PRIV-01 — Automatiser réellement la rétention sociale

**Taille : S/M**

### Problème vérifié

`docs/legal-and-privacy.md` prévoit un appel mensuel à
`purge_expired_social_data()`. Le `cron.job` live ne contient actuellement que
`purge_expired_logs()`.

### Actions

- [x] Ajouter une migration qui planifie la purge sociale avec `pg_cron`, au rythme
  validé par la politique de rétention.
- [x] Exécuter le purgeur avec un contexte maintenance, pas avec un utilisateur web.
- [x] Rendre la tâche idempotente.
- [x] Ajouter une métrique de dernière exécution / nombre de lignes supprimées.
- [x] Tester des signalements ouverts, traités <24 mois et traités >24 mois.
- [x] Documenter comment vérifier le cron après restauration DB.

### Acceptation

`cron.job` live contient la tâche attendue et un test prouve que seules les données
arrivées à échéance sont supprimées.

---

## P1-SEC-03 — Clarifier les tables server-only dans `public`

**Taille : M/L**

Les advisors signalent des tables RLS sans policy (`daily_challenge_rulesets`,
`progression_commands`, `progression_enhancement_security_baselines`). Les grants
clients sont actuellement absents, ce qui limite le risque, mais la frontière est
peu explicite.

- [ ] Documenter pour chaque table : exposée Data API ou interne.
- [ ] Pour les tables purement internes, évaluer un déplacement vers un schéma
  `private` non exposé.
- [ ] À défaut, conserver `RLS + aucun grant` et ajouter un test de privilèges.
- [ ] Configurer une allowlist des advisors INFO volontairement acceptés avec raison.
- [ ] Ne jamais ignorer globalement `rls_enabled_no_policy`.

---

# P1 — fiabilité des runs et exploitation

## P1-RUN-01 — Ajouter une surveillance des rejets authority

**Taille : M**

Le bug v13 a été découvert par un message utilisateur, alors que 4 attempts avaient
déjà été rejetées avec le même code.

- [x] Créer un agrégat technique des attempts : started / verified / rejected /
  expired, par `engine_version`, `gameplay_ruleset_version`, `rejection_code`.
- [x] Définir une alerte sur un taux de rejet anormal ou un nouveau code de rejet.
- [x] Ne pas envoyer le journal complet ni les actions joueur dans une alerte externe.
- [x] Ajouter un écran/admin ou une requête runbook donnant les 20 derniers rejets.
- [x] Afficher `attemptId`, version et code dans les diagnostics utilisateur copiables.
- [x] Ajouter un test qui simule un spike de `pending_choice` et vérifie la détection.
- [x] Définir un SLO de vérification de run et une fenêtre d'alerte.

---

## P1-RUN-02 — Améliorer l'UX d'une progression rejetée

**Taille : M**

- [ ] Mapper les `rejection_code` serveur vers des messages français actionnables.
- [ ] Distinguer : tentative expirée, trace invalide, conflit de version, choix
  manquant, séquence incorrecte, erreur serveur retryable.
- [ ] Ne pas afficher un message technique brut comme seul feedback.
- [ ] Conserver un détail technique dépliable/copiable pour support.
- [ ] Pour une erreur terminale, expliquer clairement qu'aucune récompense n'est
  créditée et pourquoi le retry ne changera pas le résultat.
- [ ] Pour une erreur retryable, proposer le retry sans reconstruire la commande.
- [ ] Tester Game Over + refresh + retour menu après rejet.

---

## P1-RUN-03 — Définir le traitement des attempts affectées par un bug client

**Taille : M — décision produit + sécurité.**

- [ ] Formaliser la règle : aucune récompense rétroactive sans preuve serveur
  suffisante.
- [ ] Décider si une compensation non liée au résultat de la run est possible pour
  les utilisateurs affectés par un incident confirmé.
- [ ] Garder une liste d'incidents par version moteur et fenêtre temporelle.
- [ ] Ne jamais « réparer » une trace rejetée en insérant manuellement un résultat
  supposé.
- [ ] Documenter la procédure support et l'audit des compensations éventuelles.

---

# P1 — CI, build et contrats d'environnement

## P1-CI-01 — Tester le déploiement du commit, pas la prod par défaut

**Taille : M**

### Problème vérifié

`scripts/verify-deployed-assets.mjs` utilise
`https://lol-rogue.vercel.app` lorsque `DEPLOYMENT_URL` n'est pas défini. Le job
`validate` l'exécute sur push **et pull_request**.

### Actions

- [x] Retirer la vérification distante de production du job de validation générique.
- [x] Sur PR : tester le build local + preview déployée correspondant au SHA.
- [x] Sur release : fournir explicitement `DEPLOYMENT_URL` du candidat.
- [x] Refuser de lancer le script distant sans URL explicite dans les contextes CI
  où la cohérence SHA est requise.
- [x] Vérifier que l'URL testée expose un marqueur de commit/version attendu.
- [x] Ajouter le SHA testé dans la sortie du script.
- [x] Conserver une vérification prod post-déploiement séparée.

### Acceptation

Une PR cassant ses assets ne peut pas passer parce que la production précédente est saine.

---

## P1-CI-02 — Découvrir automatiquement tous les tests DB

**Taille : S**

`test:db` contient actuellement une liste fixe de fichiers.

- [x] Ajouter une convention claire (`*.database.test.ts`).
- [x] Exécuter automatiquement tout fichier respectant cette convention.
- [x] Faire échouer la CI si un test DB est ignoré/skippé sans allowlist explicite.
- [x] Inclure le nouveau test d'intégration des repositories.
- [x] Ajouter un test de la commande `test:db` elle-même ou un script de discovery
  qui affiche les fichiers sélectionnés.

---

## P1-CI-03 — Vérifier la dérive migrations production ↔ dépôt

**Taille : M**

- [x] Ajouter un preflight de release comparant les versions de
  `supabase_migrations.schema_migrations` au commit candidat.
- [x] Détecter migration manquante, migration live inconnue, ordre divergent.
- [x] Ne jamais appliquer automatiquement une migration inconnue pendant un check.
- [x] Conserver la version live dans l'artefact de release.
- [x] Tester rollback applicatif avec une DB ayant déjà reçu la migration append-only.

---

## P1-TOOL-01 — Aligner les types Node avec le runtime Node 24

**Taille : S/M**

### Problème

- runtime `package.json` : Node `24.x` ;
- `.nvmrc` : `24` ;
- CI : Node 24 ;
- `@types/node` : `26.2.0`.

Les types Node 26 peuvent rendre compilable l'utilisation d'une API absente de Node 24.

### Actions

- [x] Préférer `@types/node@24` tant que le runtime reste Node 24, sauf justification
  documentée et testée.
- [x] Si les types 26 sont conservés, ajouter un check de compatibilité runtime
  explicite qui interdit les API Node >24 utilisées par les scripts exécutés.
  **Non applicable :** les types 26 ne sont pas conservés ; `@types/node` est
  épinglé sur la majeure 24 du runtime.
- [x] Corriger `docs/dependency-audit.md`, qui présente actuellement cette situation
  comme cohérente.
- [x] Ajouter un test/contrat qui compare `.nvmrc`, `package.json.engines`, CI et
  majeure de `@types/node`.

---

## P1-TOOL-02 — Typechecker aussi scripts, configs et E2E

**Taille : M**

Le `tsconfig.json` principal inclut `src`, `data` et `tests`, mais pas nécessairement
les scripts Node, configs Vite/Playwright et E2E dans un contrat dédié.

- [x] Ajouter `tsconfig.scripts.json` pour `scripts/**/*.mjs|ts` / configs TypeScript
  quand applicable.
- [x] Ajouter `tsconfig.e2e.json` pour les helpers Playwright TS.
- [x] Ajouter les checks correspondants à `npm run check`.
- [x] Vérifier les globals Node/browser séparément pour éviter des APIs disponibles
  uniquement par accident.

---

# P2 — base de données et performance

## P2-DB-01 — Ajouter les index FK utiles, après mesure

**Taille : M**

Les advisors live signalent des foreign keys non couvertes, notamment :

- `daily_challenge_rulesets.gameplay_ruleset_version` ;
- `daily_runs.daily_ruleset_version` ;
- `daily_runs.gameplay_ruleset_version` ;
- `daily_runs.invalidated_by` ;
- `daily_score_reports.reporter_user_id` ;
- `daily_score_reports.reviewed_by` ;
- `logs.player_id` ;
- `progression_commands.ruleset_version` ;
- `run_attempts.daily_ruleset_*` ;
- `run_attempts.gameplay_ruleset_version` ;
- `run_attempts.ruleset_version`.

### Actions

- [x] Inventorier les requêtes qui filtrent/joinent réellement chaque FK.
- [x] Mesurer avec `EXPLAIN (ANALYZE, BUFFERS)` sur un volume de test représentatif.
- [x] Ajouter uniquement les index dont le plan ou les opérations DELETE/UPDATE
  parent en bénéficient.
- [x] Préférer les index composites quand ils couvrent les filtres réels
  (`player_id`, `status`, `date`, version...).
- [x] Mesurer l'impact écriture et taille des index.
- [x] Repasser les advisors après migration.

Preuve : `npm run db:indexes:measure` et `npm run db:indexes:check`, résultats dans
`docs/database-index-measurements.md`.

---

## P2-DB-02 — Vérifier l'index `run_attempts_finished_queue` avant suppression

**Taille : S**

L'advisor le marque « unused ». Ne pas le supprimer automatiquement.

- [x] Vérifier la requête réelle du worker/verifier qui revendique les attempts.
- [x] Vérifier si `pg_stat_user_indexes` a été remis à zéro récemment.
- [x] Tester sous charge synthétique.
- [x] Supprimer seulement si aucun plan utile ne l'emploie et si un index équivalent
  couvre le worker.

Décision : suppression mesurée. Le verifier revendique par `id` et reste couvert
par `run_attempts_pkey`; sur la base liée, l'index partiel totalisait 0 scan sur
28 jours sans reset récent, contre 5 569 pour la clé primaire. Le benchmark local
sur 200 000 attempts conserve le même plan par PK avec et sans l'index. Preuve :
`npm run db:finished-queue:stats`, `npm run db:finished-queue:measure` et
`docs/database-finished-queue-index.md`.

---

# P2 — performance frontend

## P2-PERF-01 — Restaurer de la marge sur le budget JavaScript

**Taille : M/L**

Le budget total reste fixé à 398 kB gzip. La référence avant correction dépassait le
plafond de 321 octets ; la mesure finale atteint 349 961 octets, soit 12,07 % de marge.

- [x] Fixer un objectif de headroom, par exemple ≥10 % sous le plafond, plutôt que
  de relever le plafond à chaque upgrade.
- [x] Générer un rapport par chunk dans l'artefact CI.
- [x] Identifier le coût de React 19, Supabase, champion-data, pages admin/légales.
- [x] Lazy-loader les routes non nécessaires au premier combat.
- [x] Vérifier que le catalogue complet n'est pas tiré par `/auth` indirectement.
- [x] Étudier une segmentation des données champions affichées avant le Database.
- [x] Ajouter un budget individuel aux 5 chunks les plus lourds.
- [x] Mesurer sur une preview réelle, pas seulement le gzip statique.

Preuves et décisions : `docs/frontend-performance.md`.

---

## P2-PERF-02 — Rendre les Web Vitals réellement vérifiés en CI

**Taille : M**

`config/performance-budgets.json` contient LCP/CLS/INP, mais le script de bundle
`check-performance-budgets.mjs` ne valide que les tailles statiques.

- [x] Identifier le test qui mesure effectivement LCP/CLS/INP et vérifier qu'il est
  bloquant dans la CI actuelle.
- [x] Si absent/non bloquant, ajouter une mesure Lighthouse/Playwright contrôlée sur
  une preview locale stable.
- [ ] Séparer budget labo et télémétrie réelle consentie.
- [ ] Archiver les tendances plutôt qu'un seul point.

---

# P2 — tests et qualité

## P2-TEST-01 — Étendre la couverture aux frontières qui ont réellement cassé

**Taille : M**

- [x] Ajouter l'historique Profil / repository nested-select à la couverture critique.
- [x] Ajouter `runAuthorityJournal.ts` à un seuil spécifique élevé
- [x] Ajouter les adaptateurs PostgREST critiques au périmètre de mutation/branches.
- [x] Ajouter une régression complète « fin biome → augment → biome suivant → seal ».
- [x] Tester toutes les versions moteur reconnues par le registre futur.
- [x] Ajouter un test qui lance `getPlayerRunHistory()` contre Supabase local.

Preuves et seuils : `docs/testing.md`.

---

## P2-TEST-02 — Ajouter des seeds de test variables en complément de la seed fixe

**Taille : S/M**

La suite Vitest mélange l'ordre avec une seed fixe. C'est reproductible mais ne
cherche pas les dépendances d'ordre au-delà de cette permutation.

- [ ] Garder une seed fixe dans la CI principale pour reproductibilité.
- [ ] Ajouter une job planifiée avec plusieurs seeds aléatoires conservées dans les logs.
- [ ] En cas d'échec, imprimer la seed exacte pour reproduction locale.

---

## P2-TEST-03 — Tester avec `skipLibCheck=false` dans une gate dédiée

**Taille : S/M**

- [ ] Garder éventuellement `skipLibCheck=true` pour le cycle rapide.
- [ ] Ajouter périodiquement/CI une compilation avec `skipLibCheck=false` afin de
  détecter les incompatibilités React 19 / TS7 / types Node / Supabase.
- [ ] Documenter toute exception impossible à corriger côté projet.

---

## P2-TEST-04 — Tester les advisors Supabase comme une politique versionnée

**Taille : M**

- [x] Définir les niveaux bloquants : toute `ERROR` sécurité = échec.
- [x] Définir une allowlist précise des warnings intentionnels avec ID + justification.
- [x] Faire expirer les exceptions à une date donnée.
- [x] Rejeter une nouvelle alerte non connue.
- [x] Inclure advisors sécurité + performance dans le preflight de release.

---

# P2 — CI et supply chain

## P2-CI-01 — Ajouter protection de branche et required checks vérifiables

**Taille : S/M**

- [ ] Vérifier que `main` exige réellement `validate`, `e2e`, `database`,
  `clean-room` avant merge.
- [ ] Interdire le merge avec check annulé/neutralisé.
- [ ] Exiger branche à jour ou merge queue selon le workflow choisi.
- [ ] Garder les actions épinglées par SHA et automatiser leur mise à jour contrôlée.
- [ ] Ajouter `concurrency` pour annuler les anciens runs d'une même PR sans annuler
  une release en cours.

---

## P2-CI-02 — Séparer les gates par responsabilité

**Taille : M**

Actuellement `npm run check` fait format, lint, types, audit, couverture, asset clean,
build et production-build. C'est robuste mais peu diagnostique et répète du travail
entre jobs.

- [ ] Garder une commande locale « tout-en-un ».
- [ ] En CI, produire des checks nommés et lisibles : static, unit, security,
  build/assets, DB, browser.
- [ ] Éviter de reconstruire les mêmes artefacts plusieurs fois quand un artefact
  signé du même SHA peut être réutilisé sans réduire l'isolation de `clean-room`.
- [ ] Conserver `clean-room` comme validation indépendante sans cache applicatif.

---

# P2 — frontend sécurité et robustesse

## P2-WEB-01 — Réduire `style-src 'unsafe-inline'` dans la CSP

**Taille : M/L**

- [x] Inventorier les styles inline restants (`style={...}`, bibliothèques, variables).
- [x] Déplacer ce qui peut l'être vers classes / custom properties contrôlées.
- [x] Évaluer `style-src-attr` séparé si nécessaire.
- [x] Tester la CSP en mode Report-Only avant durcissement.
- [x] Ne pas casser les styles dynamiques de barres PV / positions de carte sans
  stratégie de remplacement.

---

## P2-WEB-02 — Fuzz de réhydratation et stockage navigateur

**Taille : M**

- [ ] Générer des payloads localStorage tronqués, anciens, surdimensionnés et mal typés.
- [ ] Vérifier qu'aucun payload ne peut restaurer un état authority impossible.
- [ ] Tester quotas / `SecurityError` / stockage indisponible sur toutes les clés
  persistées, pas uniquement le mode invité.
- [ ] Ajouter une version et une stratégie de purge pour les caches de tutoriel et
  autres clés annexes.

---

# P2 — observabilité et exploitation

## P2-OBS-01 — Définir des SLI/SLO techniques

**Taille : M**

Mesures minimales :

- taux de start run réussi ;
- taux de seal réussi ;
- taux de verification `verified/rejected/expired` ;
- délai start → verified ;
- taux de retry de finalisation ;
- taux d'erreur Auth/profile ;
- taux d'erreur PostgREST par endpoint ;
- taux d'assets cassés ;
- erreurs de réhydratation.

- [ ] Définir les seuils d'alerte.
- [ ] Ne collecter que des métriques techniques minimisées.
- [ ] Ajouter `engineVersion`, ruleset et code, sans journal de gameplay complet.
- [ ] Documenter la rétention et l'accès opérateur.

---

## P2-OPS-01 — Tester les runbooks sur une vraie restauration isolée

**Taille : L**

Le dépôt documente les procédures, mais la preuve distante reste requise.

- [ ] Restaurer un backup sur un projet Supabase isolé distant. La répétition locale
  jetable est réussie ; la cible hébergée dédiée reste à fournir.
- [x] Vérifier migrations, Auth, RLS, cron, functions, storage/config nécessaires
  sur la restauration locale isolée.
- [x] Mesurer RPO/RTO réels sur la répétition locale : 7,381 s / 32,537 s.
- [x] Exécuter un incident simulé « verify-run indisponible ».
- [x] Exécuter un incident simulé « leaderboard compromis ».
- [x] Conserver date, environnement, opérateur et résultat dans
  `docs/restore-drills/2026-08-12-local.json`.

---

# P2 — documentation cohérente avec le live

## P2-DOC-01 — Recalculer tous les statuts après le réaudit

**Taille : M**

- [ ] `docs/beta-readiness.md` : repasser les gates ouvertes en bloqué.
- [ ] `docs/feature-status.md` : ajouter « risque réouvert » / « validation live requise ».
- [ ] `docs/dependency-audit.md` : corriger la contradiction Node24 / types Node26.
- [ ] `docs/legal-and-privacy.md` : remplacer la purge sociale « maintenance appelle
  mensuellement » par l'état réel tant que le cron n'est pas déployé.
- [ ] `docs/operations.md` : ajouter la vérification advisors/grants/cron au runbook.
- [ ] `docs/data-and-persistence.md` : documenter les tests de contrat réels des repositories.
- [ ] Relier chaque claim critique à une commande ou un test exécutable.

---

# P3 — améliorations produit après fermeture P0/P1

## P3-PROD-01 — Historique de runs plus exploitable

**Taille : M**

- [ ] Ajouter filtres victoire/défaite, difficulté, mode, moteur/ruleset.
- [ ] Afficher clairement « legacy / non comparable ».
- [ ] Ajouter détail de rejet technique uniquement pour le propriétaire/admin.
- [ ] Pagination par curseur si le volume devient significatif.
- [ ] Éviter de charger toutes les relations lourdes pour une simple liste.

---

## P3-PROD-02 — Internationalisation anglaise complète

**Taille : L**

- [ ] Transformer le dictionnaire français actuel en vraie sélection de locale.
- [ ] Ajouter `en` avec couverture de toutes les pages et contenus.
- [ ] Tester nombres, dates, pluriels, aria-labels et textes de domaine.
- [ ] Conserver le français comme fallback explicite.

---

## P3-PROD-03 — PWA/offline : décider au lieu de laisser un entre-deux

**Taille : M/L**

Le contrat actuel garantit seulement l'invité déjà chargé hors ligne.

- [ ] Décider officiellement : pas de PWA, ou PWA invitée.
- [ ] Si PWA : cache versionné, invalidation assets, offline shell et mises à jour sûres.
- [ ] Ne jamais permettre de démarrer une run authentifiée hors ligne.
- [ ] Tester upgrade du service worker sans casser une run active.

---

## P3-PROD-04 — Enrichissement de contenu avec gate de support moteur

**Taille : continue**

- [ ] Aucun champion/rune/augment/item/encounter ajouté sans handler supporté.
- [ ] Ajouter un test de catalogue qui bloque toute mécanique non implémentée.
- [ ] Versionner chaque changement affectant le replay / Daily.
- [ ] Mesurer les courbes de difficulté après chaque lot de contenu.
- [ ] Conserver les anciens bundles nécessaires aux attempts ouvertes.

---

## P3-A11Y-01 — Validation humaine avant bêta

**Taille : M**

- [ ] NVDA + Firefox : parcours Auth → Starter → Map → Combat → Game Over.
- [ ] VoiceOver + Safari macOS.
- [ ] VoiceOver + Safari iOS sur petit écran.
- [ ] Zoom 200/400 % et navigation clavier réelle.
- [ ] Consigner les défauts dans des issues dédiées et bloquer la release sur tout
  défaut empêchant le parcours.

---

## P3-LEGAL-01 — Fermer les blockers externes de diffusion

**Taille : externe / non estimable**

- [ ] Compléter identité/adresse éditeur et directeur de publication.
- [ ] Publier/tester un canal privé pour les demandes de droits.
- [ ] Vérifier région Supabase, DPA, transferts et sous-traitants.
- [ ] Obtenir une revue RGPD/ePrivacy professionnelle.
- [ ] Obtenir une analyse écrite de compatibilité avec la propriété intellectuelle Riot.
- [ ] Interdire monétisation/publicité/sponsoring tant que ces points ne sont pas clos.

---

# 2. Ordre d'exécution recommandé

## Sprint A — fermer les risques live

1. [x] `P0-SEC-01` vues leaderboard.
2. [x] `P0-SEC-02` grants/functions.
3. [x] `P0-DATA-01` integration repositories DB.
4. [x] `P0-RUN-01` registre authority.
5. [x] `P0-REL-01` readiness réelle.

## Sprint B — sécurité et exploitation

6. [ ] `P1-SEC-01` mots de passe compromis — différé explicitement tant que
   l'option payante n'est pas souhaitée.
7. [x] `P1-PRIV-01` cron rétention sociale.
8. [x] `P1-CI-01` preview SHA-correcte.
9. [x] `P1-CI-02` auto-discovery DB tests.
10. [x] `P1-TOOL-01` Node types/runtime.
11. [x] `P1-RUN-01` surveillance des rejets.

## Sprint C — performance / dette

12. [x] `P2-DB-01` index mesurés.
13. [x] `P2-PERF-01` headroom bundle, sans modifier l'interface.
14. [x] `P2-TEST-01` couverture des frontières critiques.
15. [x] `P2-TEST-04` advisors versionnés.
16. [x] `P2-WEB-01` CSP.
17. [ ] `P2-OPS-01` runbook de restauration réelle.

## Sprint D — robustesse locale

18. [x] `P1-TOOL-02` typecheck scripts, configs et E2E.
19. [x] `P2-DB-02` décision mesurée sur `run_attempts_finished_queue`.
20. [ ] `P2-PERF-02` Web Vitals sur preview locale stable.
21. [ ] `P2-TEST-02` seeds variables reproductibles.
22. [ ] `P2-TEST-03` gate `skipLibCheck=false`.
23. [ ] `P2-WEB-02` fuzz de réhydratation et stockage navigateur.

## Sprint E — fiabilité produit et exploitation

24. [ ] `P1-SEC-03` frontière explicite des tables server-only.
25. [ ] `P1-RUN-02` UX des progressions rejetées.
26. [ ] `P1-RUN-03` traitement des attempts affectées par un bug client.
27. [ ] `P2-OBS-01` SLI/SLO techniques minimisés.
28. [ ] `P2-DOC-01` statuts recalculés et preuves exécutables.

## Sprint F — architecture et produit

29. [ ] `P2-CI-02` gates séparées par responsabilité, avec commande locale
    tout-en-un conservée.
30. [ ] `P3-PROD-01` historique de runs exploitable.
31. [ ] `P3-PROD-02` internationalisation anglaise.
32. [ ] `P3-PROD-03` décision PWA/offline.
33. [ ] `P3-PROD-04` enrichissement avec gate moteur.

## Sprint G — validations humaines et externes

34. [ ] `P3-A11Y-01` validation humaine multi-lecteurs d'écran.
35. [ ] `P3-LEGAL-01` blockers externes de diffusion.

## Backlog différé par décision de coût

- `P1-SEC-01` reste visible mais ne doit pas activer Leaked Password Protection
  tant que cette option payante n'est pas souhaitée.
- `P2-CI-01` (required checks distants et merge queue) n'est planifié dans aucun
  sprint tant que les tests sont exécutés localement uniquement.
- Les autres tâches utilisent `npm run check`, `npm run db:validate` et les gates
  locales spécialisées comme preuves ; une CI distante n'est pas un prérequis de merge.

---

# 3. Nouvelle gate de bêta proposée

La bêta technique ne redevient candidate que lorsque :

- [ ] aucun `P0-*` n'est ouvert ;
- [ ] advisors sécurité live : aucune `ERROR` non acceptée ;
- [ ] aucune fonction de trigger/maintenance inutile n'est client-callable ;
- [ ] repository integration tests passent contre une vraie base migrée ;
- [ ] dernière migration live = migration attendue par le SHA candidat ;
- [ ] trois CI complètes consécutives **après** le dernier P0 ;
- [ ] preview du SHA candidat validée, pas une ancienne prod ;
- [ ] taux de rejet authority vérifié après déploiement du correctif ;
- [ ] cron de rétention vérifiés ;
- [ ] audit mots de passe compromis activé ;
- [ ] runbook restauration testé sur environnement isolé ;
- [ ] revue accessibilité humaine effectuée ;
- [ ] blockers juridiques externes fermés pour toute diffusion publique.

---

# 4. Règle de maintenance de ce fichier

- Ne pas ajouter de compte rendu historique détaillé ici.
- Lorsqu'un item est terminé, le cocher et ajouter au maximum une ligne de preuve.
- À chaque gros jalon, déplacer les items terminés dans une archive datée et garder
  `TODO.md` concentré sur le travail restant.
- Toute régression observée en production peut rouvrir un sujet ancien avec un nouvel ID.
- Les statuts « livré », « sécurisé », « prêt bêta » doivent toujours pouvoir être
  recalculés depuis des preuves exécutables et l'état live, jamais depuis une case
  cochée seule.
