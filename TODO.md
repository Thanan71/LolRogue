# TODO — audit complet et backlog courant de LolRogue

Dernier réaudit : **13 août 2026** (passe UI de la carte et du combat, puis audit
complet de l'équilibrage combat/progression/économie).

Mise à jour ciblée : **26 août 2026** — ajout d'un correctif d'équilibrage urgent pour
sortir les cohortes authority du blocage early Top sans absorber le tuning structurel
P1, et ajout du système de notes de mise à jour côté produit.

Ce fichier remplace l'ancien TODO historique. Son snapshot exact est conservé dans
[`docs/archive/todo-snapshot-2026-08-08-1837.md`](docs/archive/todo-snapshot-2026-08-08-1837.md).

Le but de ce document est simple : **ne contenir que des actions encore utiles**.
Les travaux déjà livrés restent documentés dans l'historique Git, `docs/feature-status.md`
et les archives ; ils ne sont pas recopiés ici sous forme de centaines de cases cochées.

### État produit livré lors de la passe UI du 13 août

La carte expose désormais des panneaux compacts et responsives pour l'équipe,
l'inventaire et les améliorations de sorts. Les statistiques et aperçus de dégâts
réutilisent les calculs de combat réels (équipement, améliorations, maîtrise et boosts),
les icônes de compétences sont les assets Data Dragon livrés localement, et le ciblage
du combat distingue explicitement le camp et l'identifiant stable du combattant.
Preuves : `runInventoryPanel.test.tsx`, `runTeamStatsPanel.test.tsx`,
`spellUpgradePanel.test.tsx`, `spellTooltip.test.tsx`, `combatPresentation.test.tsx`
et `run-loadout-panels.spec.ts`.

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

# P0 — sécurité, autorité, équilibre et release gates

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

## P0-BAL-01 — Corriger les incohérences fondamentales du moteur de combat

**Taille : L**
**Risque : élevé — tout tuning numérique serait calibré autour de comportements cassés.**

### Problèmes vérifiés

- Un cooldown décimal peut passer sous zéro et ne plus jamais satisfaire
  `isSpellReady() === true`. Les secondes LoL sont en outre utilisées directement
  comme des tours.
- Les MP finaux sont sauvegardés dans la run, mais chaque nouveau combat les remet
  au maximum parce que seuls les PV initiaux sont réinjectés.
- Les parties hostiles d'Ashe Q, Jinx Q, Leona W, Malphite W et Warwick E ne sont
  pas résolues correctement lorsque le sort est déclaré `Self`.
- Electrocute annonce trois compétences, mais son déclencheur devient actif après
  la première.
- Les dégâts/exécutions et certains effets de rune peuvent être évalués dans un
  ordre ou un nombre de fois incohérent.

### Actions

- [x] Considérer un sort prêt lorsque `cooldown <= 0` et clamper chaque tick avec
  `Math.max(0, cooldown - 1)`.
- [x] Remplacer les cooldowns en secondes par des `cooldownTurns` entiers ; point
  de départ à mesurer : Q/W/E entre 2 et 5 tours, R entre 6 et 10 tours.
- [x] Ajouter `initialMpOverrides` au même niveau que `initialHpOverrides`, côté UI
  et moteur autoritaire, avec clamp `0..maxMp`.
- [x] Formaliser l'attrition mana : point de départ à tester, récupération de
  20–30 % des MP max après victoire et 100 % au repos.
- [x] Ajouter une validation catalogue cible/effet et corriger les cinq sorts
  composites `Self` ayant une partie hostile.
- [x] Faire respecter le seuil `threshold: 3` d'Electrocute.
- [x] Tester explicitement l'ordre « dégâts puis execute » ou « execute sur PV
  avant dégâts » et retenir une seule règle documentée pour Garen/Jinx.
- [x] Empêcher la double évaluation des runes `damage_dealt` sur critique et exclure
  les dégâts bruts des multiplicateurs de pénétration.
- [x] Ajouter les régressions équivalentes dans les parcours UI et authority.

### Acceptation

- zéro sort bloqué définitivement par un cooldown négatif ;
- MP de fin du combat N = MP initiaux du combat N+1, plus la récupération documentée ;
- zéro effet hostile accepté sans cible hostile résoluble ;
- seuil Electrocute, execute et critique couverts par des tests déterministes ;
- parité source/bundle authority validée sur ces scénarios.

### Fichiers / zones

- `src/game/ChampionInstance.ts`
- `src/game/battle/BattleManager.ts`
- `src/game/battle/BattleSpellEffectResolver.ts`
- `src/game/runes/RuneManager.ts`
- `src/game/rules/CombatRuleRuntime.ts`
- catalogues champions et runes

---

## P0-BAL-02 — Remplacer la fausse simulation de balance par de vraies runs

**Taille : L**
**Risque : élevé — `balance:check` donne actuellement une assurance qu'il ne mesure pas.**

### Problème vérifié

`simulateContentBalance()` parcourt tous les nœuds de toutes les branches et appelle
uniquement `resolveCombatEncounter()` avec un inventaire vide et une progression
synthétique. Il ne choisit pas de route, ne lance pas `BattleManager`, ne conserve
pas PV/MP, n'achète rien, ne recrute personne et ne calcule aucun taux de victoire.
La documentation « 100 runs complètes / 30 runs scriptées » est donc incorrecte.
Les versions balance sont aussi recopiées manuellement puis testées contre elles-mêmes.

Mesures exploratoires à conserver comme point de comparaison, mais **pas** comme cible
avant correction du moteur : premiers combats Top en Normal, Ashe/Soraka ≈ 67 % et les
autres 100 % ; en Hard, Annie/Ashe/Jinx 0 %, cinq champions ≈ 33 % et Darius/Warwick
≈ 67 %. En duel niveau 1, Darius fait 90–0 et Annie 0–90. Sur toutes les partitions
5v5 niveau 1, Malphite atteint 98 % de victoire d'inclusion et le combat moyen ne dure
que 2,42 rounds.

### Actions

- [x] Créer une `BalancePolicy` versionnée qui, depuis le snapshot public de la run,
  renvoie une seule commande légale : route, combat, achat, recrutement, équipement,
  augment, rune et amélioration de sort.
- [x] Construire `simulateAuthorityCohort()` autour de `replayAuthorityRun()` sur le
  bundle Edge courant, avec vérification terminale par `verifyAuthorityRun()`.
- [x] Ajouter limites de commandes/temps, détection de deadlock et reproduction de
  la seed pour chaque échec.
- [x] Stratifier chaque cohorte par difficulté × taille/composition d'équipe ×
  maîtrise/runes/enhancements × politique.
- [x] Produire au minimum : victoire avec intervalle Wilson, vagues/biomes p10-p50-p90,
  biome/encounter de mort, rounds, PV/MP, dégâts/soins/CC, or gagné/dépensé,
  affordability, achats, recrues, drops par rareté et choix d'augments.
- [x] Indexer la baseline JSON par moteur, `contentHash`, version du modèle et version
  de politique ; conserver seulement les traces de seeds extrêmes comme artefacts CI.
- [x] Exécuter 30–50 seeds par cellule en PR et 500–1 000 en nightly/release.
- [x] Lire les versions gameplay/hash depuis le registre authority unique et le score
  Daily depuis une source machine unique ; supprimer les constantes parallèles.
- [x] Corriger `docs/content-balance.md` et renommer les métriques qui ne sont pas des
  simulations de runs.

### Gates initiales

- [x] Zéro crash, deadlock, non-déterminisme ou divergence source/bundle.
- [ ] Easy ≥ Normal ≥ Hard avec tolérance statistique, sans masquer les cohortes par
  taille d'équipe ou niveau méta.
- [ ] Aucun starter à 0 % sur les premiers combats ; plage de travail : Normal
  75–95 %, Hard 50–80 %.
- [ ] Inclusion 5v5 par champion entre 45–55 %, écart maximal 10 points, après
  correction des règles communes.
- [ ] Aucun biome hors boss ne concentre plus de 35–40 % des morts.
- [ ] Une régression supérieure à 5 points de victoire, 0,5 biome médian ou 10 %
  d'économie exige un diff et une baseline explicitement approuvée.

Les taux de victoire d'une run complète restent des hypothèses à valider avec des
playtests humains ; ils ne doivent pas être figés depuis l'autoplay seul.

---

## P0-BAL-03 — Garantir l'égalité des règles Daily et des départs comparables

**Taille : M/L**
**Risque : élevé — classement Daily et progression de départ non comparables.**

### Problèmes vérifiés

- Le Daily vide les enhancements, mais le contrat mastery réinjecte ensuite jusqu'à
  +8 % à toutes les statistiques selon le compte.
- Les slots 2 et 3 sont débloqués globalement par la maîtrise ; ils donnent environ
  deux ou trois fois plus de corps/actions sans budget ennemi équivalent.
- Une même loadout de jusqu'à trois keystones est appliquée à chaque champion, ce qui
  peut produire neuf applications avec trois starters.

### Actions

- [x] Forcer `mastery_snapshot = {}` et `enhancement_snapshot = {}` dans le Daily,
  côté contrat DB **et** côté moteur, avec règles/runes versionnées et identiques.
- [x] Ajouter un test contractuel « compte neuf = compte maxé » à seed et commandes
  identiques, jusqu'au score terminal.
- [x] Donner le même nombre de starters à toutes les runs comparables ; recommandation
  de départ : deux starters par défaut en Normal, un starter normalisé en Daily.
- [x] Transformer la maîtrise en largeur de roster, reroll ou cosmétique plutôt qu'en
  avantage de taille d'équipe pour les modes classés.
- [x] Si 1/2/3 starters sont conservés, séparer les cohortes/classements et tester un
  budget de formation ennemi autour de ×1 / ×1,55 / ×2.
- [x] Affecter les runes par champion avec budget partagé, ou rendre leur effet unique
  au niveau équipe ; empêcher la multiplication implicite par le nombre de starters.
- [x] Réduire Grasp ou le réinitialiser par combat ; point de départ : +2 DEF/+15 PV,
  cinq déclenchements maximum.

### Acceptation

Deux comptes de progression opposée doivent produire exactement le même Daily officiel.
Aucun classement ne doit agréger sans stratification des runs à budgets de départ
différents.

---

## P0-BAL-04 — Rétablir la hiérarchie augments/drops et couper le snowball économique

**Taille : M/L**
**Risque : élevé — quelques choix dominent à la fois la puissance et le score Daily.**

### Problèmes vérifiés

- Les bonus plats Silver dépassent souvent les pourcentages Gold : +20 AP représente
  environ +154 à +250 % d'AP au niveau 1, tandis que Gold ne donne que +12 %.
- Les augments économiques actuels peuvent rapporter environ 825 / 1 650 / 3 300 or
  après le choix Top, contre environ 1 222 or pour une run Normal entière sans achat.
- Le score Daily récompense l'or total gagné : ces augments dominent donc à la fois
  la puissance de la run et le classement, même lorsque l'or est dépensé.
- Les drops sont uniformes par ID : environ 26,7 % de légendaires et 40 % de tier 2
  par drop ; Hard augmente encore cette puissance via +15 % de chance de drop.

### Actions

- [x] Recalibrer les Silver autour de +7 ATK, +5 DEF, +7 AP, +90 PV et +12–15 MS.
- [x] Recalibrer Gold autour de +12–15 % et Prism autour de +22–25 %.
- [x] Ramener l'or/combat Silver/Gold/Prism autour de 15–20 / 35–45 / 60–75 ;
  plafonner la remise Prism à 10 %.
- [x] Utiliser une table de rareté explicite : common 55 %, uncommon 25 %, epic 15 %,
  legendary 5 %, puis tirer l'item dans la rareté.
- [x] Gater le tier 2 par biome : Top 0 %, Jungle/Mid 10 %, Bot 20 %, River 30 %,
  boss final garanti ou table dédiée.
- [x] Retirer le bonus de drop Hard ou le remplacer par score/récompense méta ne
  renforçant pas la run en cours.
- [x] Ajouter des tests statistiques de rendement restant, rareté, valeur et
  domination de choix ; aucune option ne doit dépasser durablement 55–60 % de pick.

### Acceptation

Chaque rang d'augment doit avoir une valeur attendue strictement supérieure au rang
précédent sans rendre l'économie dominante. La distribution de drops observée sur
10 000 tirages doit rester dans la tolérance de la table et respecter les gates biome.

---

## P0-BAL-05 — Débloquer l'early Top avant le tuning structurel

**Taille : M**  
**Risque : élevé — les cohortes authority ne sont pas exploitables pour le tuning fin
si la run meurt quasi systématiquement dans les premiers encounters.**

### Signal actuel à traiter

Les cohortes courantes remontent un symptôme bloquant : taux de victoire de run à
0 % dans le scénario concerné et mortalité concentrée dans les trois premiers
encounters `top_lane`. Ce ticket est volontairement un **correctif de stabilisation** :
il ne remplace ni `P1-BAL-01` (AoE, CC, difficulté globale, IA) ni `P1-BAL-02`
(courbe complète de carte et économie).

### Actions

- [x] Capturer avant tout changement une cohorte authority reproductible et les seeds
  extrêmes démontrant le 0 % de victoire et les morts early Top ; conserver le diff
  comme preuve plutôt que de tuner à partir d'un ressenti.
- [x] Recalibrer en premier le budget de formation de départ (`enemyFormationMultiplier`)
  et la puissance des encounters `top_*`, en ciblant particulièrement les élites ;
  éviter un nerf global de tous les biomes tant que le problème reste localisé.
- [ ] Mesurer ensuite l'affordability early ; si elle contribue au blocage, augmenter
  modérément l'or des premiers encounters et/ou réduire les prix des consommables et
  boots d'entrée de gamme sans réintroduire le snowball fermé par `P0-BAL-04`.
- [ ] N'appliquer un léger buff de survie aux starters (par exemple Garen/Ashe) que si
  le diff après formation + encounters + économie laisse encore un outlier individuel ;
  chaque buff doit être mesuré séparément.
- [ ] Ne pas buff Warwick dans ce correctif avant la correction de son E et de l'IA
  prévue par `P1-BAL-01`, sauf preuve de cohorte contredisant explicitement cette gate.
- [ ] Ne pas retoucher les tables d'augments ou de drops de `P0-BAL-04` pour compenser
  un early trop dur.
- [ ] Si le changement modifie un contrat rejouable/authority, publier la version
  gameplay/engine nécessaire, régénérer le bundle et la baseline sans réécrire les
  archives historiques.
- [ ] Relancer les cohortes Easy/Normal/Hard et par starter après chaque lot logique ;
  conserver taux de victoire, encounter de mort, PV/MP, or et affordability avant/après.

### Acceptation de sortie du blocage

- la cohorte de run concernée n'est plus à 0 % de victoire ;
- Easy atteint au moins une **zone de travail préliminaire de 25–30 %** de victoire
  pour permettre le tuning suivant ; ce seuil n'est pas la cible finale de difficulté ;
- la mort n'est plus quasi systématique dans les trois premiers encounters Top ;
- aucun starter ne reste à 0 % sur les premiers combats de la cohorte ciblée ;
- le correctif ne casse ni la parité Daily de `P0-BAL-03`, ni la hiérarchie
  augments/drops et le contrôle du snowball de `P0-BAL-04` ;
- les gates finales de `P0-BAL-02` restent la référence avant de déclarer
  l'équilibrage mesuré acceptable.

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

# P1 — équilibrage combat, progression et économie

## P1-BAL-01 — Recalibrer AoE, CC, difficulté et IA avant les champions

**Taille : L**

### Problèmes vérifiés

- `Area` touche toujours les cinq ennemis à pleine puissance ; les ultimes de zone
  peuvent donc produire 500 % de dégâts et retirer jusqu'à 10–20 actions ennemies.
- Le hard CC décimal est arrondi au tour supérieur. Soraka E cumule notamment silence
  et snare sur toute l'équipe.
- Tous les ultimes commencent prêts et l'autoplay choisit toujours
  `R > E > W > Q > attaque`, sans considérer PV, nombre de cibles ou gaspillage.
- Le multiplicateur de difficulté touche PV, mana, dégâts, défenses, initiative,
  régénération, critique et même des statistiques actuellement inutilisées comme la portée.
- L'attack speed ne donne pas d'attaque supplémentaire et la portée n'influence pas
  la légalité d'une action ; leur valeur affichée ne correspond donc pas au moteur.

### Actions système

- [ ] Limiter une AoE standard à trois cibles, ou appliquer 100 % à la cible principale
  et 50 % aux secondaires, avec plafond de 300 % de dégâts totaux.
- [ ] Limiter le hard CC à un tour et empêcher une cible de perdre plus de deux actions
  sur une fenêtre de quatre rounds.
- [ ] Rendre les ultimes indisponibles avant le round 3.
- [ ] Ajouter une IA contextuelle : soin/bouclier sous 70 % PV, execute selon le seuil,
  AoE seulement avec au moins deux cibles utiles, cible alliée la plus blessée et cible
  ennemie choisie par valeur effective plutôt qu'au hasard.
- [ ] Pour la difficulté, multiplier les PV par le facteur voulu, les dégâts par sa
  racine, et laisser défenses, mana, vitesse, portée, critique et régénération inchangés.
- [ ] Décider explicitement le rôle de la vitesse d'attaque et de la portée ; retirer
  ou renommer tout bonus sans effet tant que la mécanique n'existe pas.
- [ ] Ramener les slows cumulés à un plafond de design inférieur à 99 %.

### Tuning champions, uniquement après les actions système

- [ ] Darius : un seul DoT rafraîchi, cinq charges maximum, environ 8–10 dégâts/tour
  au niveau 1 ; corriger E en vraie pénétration au lieu d'un bonus d'armure.
- [ ] Malphite : tester R 150/250/350, knock-up un tour et bouclier 7 % au lieu de 10 %.
- [ ] Soraka : R en `Allies`, E avec silence un tour et slow à la place du double verrouillage.
- [ ] Garen/Jinx : appliquer la règle d'execute commune retenue dans `P0-BAL-01`.
- [ ] Recalibrer l'AP naturel vers environ 20–30 au niveau 1 et 100–140 au niveau 18,
  puis réduire les dégâts de base si nécessaire.
- [ ] Auditer chaque rang de sort : valeur marginale strictement positive, environ
  +10–18 % d'effet primaire ou amélioration de cooldown/coût ; Ashe E ne doit plus
  proposer des rangs sans effet.
- [ ] Ne pas buff Warwick avant correction de son E et de l'IA : il est faible en
  inclusion 5v5 mais déjà très fort en duel.

### Acceptation

- aucun champion ne doit rester à 0 ou 100 % sur une matrice large uniquement à cause
  d'une règle générique ;
- les rapports exposent dégâts par round, soins effectifs, shield absorbé, mana
  consommée et actions ennemies supprimées par CC ;
- tout changement individuel est justifié par un diff de cohorte après correctifs système.

---

## P1-BAL-02 — Recalibrer carte, shop, repos, trésors et recrutement

**Taille : L**

### Problèmes vérifiés

- Selon la route, une run contient environ 15,7 à 24,9 combats, 1,1 à 4,9 élites,
  0,5 à 2,7 shops et 0,4 à 2,9 recrutements.
- Le shop moyen n'apparaît qu'environ 1,46 fois par run ; seulement ~41 % des offres
  sont abordables à l'arrivée, et BF Sword coûte presque tout le revenu d'une run.
- Le repos paie une seule fois pour soigner toute l'équipe et devient 6–10 fois plus
  efficace qu'une potion par gold avec trois à cinq champions.
- Le trésor est sans risque et donne en moyenne plus qu'un grand nombre de combats.
- Une recrue tardive arrive niveau 1 et peut finir plusieurs niveaux derrière l'équipe.
- Les candies sont divisées par la taille finale, ce qui encourage à ne pas recruter.
- Les élites n'ont pas un budget homogène : un renfort sur une formation solo vaut bien
  plus que +8 % de statistiques sur une formation multiple.

### Actions

- [ ] Contraindre tous les chemins à un écart maximal de trois combats et une élite ;
  équilibrer la valeur attendue par colonne et par risque.
- [ ] Garantir un shop avant la fin Jungle et une recrue avant la fin Mid.
- [ ] Tester une courbe biome monotone autour de Top 1, Jungle 1,1, Mid 1,2,
  Bot 1,25, River 1,4, Base 1,6, puis valider par TTK/perte de PV plutôt que somme de stats.
- [ ] Donner aux élites un budget de puissance constant d'environ +35–45 % et une
  récompense +50 %, quelle que soit la taille de la formation source.
- [ ] Recaler les composants autour de 100–250 gold, BF Sword 500–650 et les recrues
  150–300 ; implémenter de vraies recettes ou retirer le faux signal de craft.
- [ ] Faire varier le repos selon l'effectif ; point de départ : partial
  `20 + 10L + 20(n-1)`, full `50 + 20L + 40(n-1)`.
- [ ] Réduire le trésor vers `30 + 15L + 0..30`, drop 25 %, ou proposer un choix
  exclusif or/item avec contrepartie.
- [ ] Remplacer un événement négatif inabordable par une petite contrepartie ou aucun
  gain, au lieu de repondérer automatiquement vers une issue positive.
- [ ] Recruter au niveau `max(runLevel + 1, médianeEquipe - 1)`.
- [ ] Remplacer la division des candies par taille finale par un budget de compte fixe
  et une part champion liée à sa participation/aux biomes parcourus.
- [ ] Clarifier si les fins de biome sont de vrais boss ; le boss Base forcé et les
  autres sorties doivent utiliser une terminologie cohérente.

### Acceptation

- une route ne doit plus décider à elle seule de plusieurs niveaux ou achats d'écart ;
- le joueur médian doit pouvoir prendre au moins une décision d'achat utile avant la
  première sortie de biome concernée ;
- recruter tard ne doit être ni un piège immédiat de combat ni une pénalité de maîtrise ;
- l'efficacité du repos doit rester au plus 2–3 fois celle d'une potion par gold.

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

Le budget historique de 398 kB gzip a permis de ramener la première passe à
349 961 octets. La passe UI animée du 13 août relève explicitement le plafond global
à 410 kB, conserve tous les sous-budgets et atteint 360 110 octets, soit 12,17 % de
marge.

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
- [x] Séparer budget labo et télémétrie réelle consentie.
- [x] Archiver les tendances plutôt qu'un seul point.

Preuve : `npm run test:performance-preview` exécute un warm-up puis cinq mesures
Pixel 5 contrôlées, refuse LCP/INP nuls, applique les budgets au p75 et écrit
`performance-report/web-vitals-report.json`. Le job CI `validate` est bloquant et
archive les échantillons pendant 30 jours. Résultats dans
`docs/frontend-performance.md`.

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

## P2-BAL-01 — Confronter les cohortes autoritaires aux playtests et au terrain

**Taille : M/L**

- [ ] Définir au moins deux politiques automatisées distinctes — sûre et économique —
  pour ne pas confondre équilibre et comportement d'un seul bot.
- [ ] Organiser des playtests humains par difficulté, taille d'équipe et expérience ;
  fixer ensuite les bandes de victoire Easy/Normal/Hard au lieu de les déduire de
  l'autoplay seul.
- [ ] Construire une vue admin agrégée depuis les runs vérifiées et attempts existantes,
  groupée par date, ruleset, difficulté, mode, taille/hash de composition et niveau méta.
- [ ] Ne jamais mélanger des versions de ruleset dans une même moyenne et contrôler les
  effets de composition/taille avant d'attribuer un écart à un champion.
- [ ] Appliquer un seuil minimal `n >= 30`, des intervalles d'incertitude et aucune
  exposition de user ID, seed ou journal de commandes.
- [ ] Ajouter uniquement en opt-in les mesures non déjà nécessaires au service, comme
  offres vues/refusées ou raison d'abandon ; définir leur rétention avant collecte.
- [ ] Comparer simulation et terrain sur taux de victoire, biome de mort, économie,
  pick rate et performance conditionnelle des champions/augments.
- [ ] Exiger une décision produit et une baseline explicitement versionnée pour toute
  dérive volontaire importante.

### Acceptation

Une décision de tuning doit citer une cohorte autoritaire reproductible et un signal
de playtest/terrain compatible, avec taille d'échantillon et intervalle affichés.

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

## P3-PROD-05 — Notes de mise à jour et nouveautés depuis la dernière visite

**Taille : M**  
**Objectif : rendre visibles les changements joueur sans exposer le bruit des commits
techniques ni afficher une modale à chaque déploiement.**

### Contrat produit

- une patch note possède un identifiant/version de publication explicite et une date ;
- plusieurs PR/commits peuvent être regroupés dans une même publication ;
- un déploiement ou un nouveau SHA **sans** nouvelle patch note ne doit rien afficher ;
- les textes décrivent l'impact joueur (« Normal démarre avec 2 champions »), pas les
  détails internes (« normalize ranked starter budget »).

### Actions

- [ ] Ajouter une source versionnée de patch notes dans le code avec catégories
  `Nouveau`, `Équilibrage` et `Correctifs`, titre, date, version et entrées lisibles.
- [ ] Ajouter une page permanente `/patch-notes` consultable depuis le menu, avec
  historique et filtres/catégories sans dépendre d'une modale.
- [ ] Afficher au retour au menu principal un résumé **non bloquant** uniquement si une
  publication plus récente que la dernière vue existe ; regrouper plusieurs versions
  non lues au lieu d'enchaîner plusieurs popups.
- [ ] Ajouter un badge/indicateur « Nouveau » et une action explicite « J'ai compris » /
  « Marquer comme lu ».
- [ ] Pour un invité, persister la dernière version vue via `safeLocalStorage` avec une
  clé versionnée et un fallback sûr si le stockage navigateur est indisponible.
- [ ] Pour un compte connecté, synchroniser la dernière version vue côté serveur afin
  d'éviter de réafficher la même note sur un autre appareil ; ne pas détourner
  `last_login_at`, qui est mis à jour lors de l'établissement de session.
- [ ] Prévoir un fallback local si la persistance serveur de l'état « lu » est
  momentanément indisponible ; une erreur de patch notes ne doit jamais bloquer Auth,
  Menu, reprise ou lancement d'une run.
- [ ] Tester focus initial, fermeture clavier, retour du focus, lecteur d'écran,
  reduced motion et petits écrans ; ne jamais ouvrir la modale au milieu d'une run.
- [ ] Ajouter tests unitaires du calcul « versions non lues » et E2E : première visite,
  version déjà lue, nouvelle version, invité, compte connecté et simple redéploiement.

### Acceptation

- une nouvelle publication apparaît une fois au prochain retour pertinent puis reste
  accessible dans l'historique ;
- un utilisateur connecté ne revoit pas la même publication sur un second appareil ;
- un invité ne la revoit pas dans le même profil navigateur après l'avoir marquée lue ;
- aucun SHA/déploiement sans nouvelle publication ne déclenche l'UI ;
- le système reste non bloquant et accessible sur desktop/mobile/clavier.

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

## Sprint B — rendre l'équilibrage mesurable et comparable

6. [x] `P0-BAL-01` intégrité des règles combat, mana, cooldowns et ciblage.
7. [ ] `P0-BAL-02` vraies cohortes via le moteur authority et baseline versionnée.
8. [x] `P0-BAL-03` Daily neutralisé et budgets de départ comparables.
9. [x] `P0-BAL-04` hiérarchie augments/drops et économie non dominante.
9 bis. [ ] `P0-BAL-05` sortir l'early Top du 0 % avant le tuning structurel.
10. [ ] `P1-BAL-01` AoE, CC, difficulté, IA puis tuning champions.
11. [ ] `P1-BAL-02` carte, shop, repos, trésors et recrutement.
12. [ ] `P2-BAL-01` playtests et comparaison simulation/terrain.

## Sprint C — sécurité et exploitation

13. [ ] `P1-SEC-01` mots de passe compromis — différé explicitement tant que
   l'option payante n'est pas souhaitée.
14. [x] `P1-PRIV-01` cron rétention sociale.
15. [x] `P1-CI-01` preview SHA-correcte.
16. [x] `P1-CI-02` auto-discovery DB tests.
17. [x] `P1-TOOL-01` Node types/runtime.
18. [x] `P1-RUN-01` surveillance des rejets.

## Sprint D — performance / dette

19. [x] `P2-DB-01` index mesurés.
20. [x] `P2-PERF-01` headroom bundle, sans modifier l'interface.
21. [x] `P2-TEST-01` couverture des frontières critiques.
22. [x] `P2-TEST-04` advisors versionnés.
23. [x] `P2-WEB-01` CSP.
24. [ ] `P2-OPS-01` runbook de restauration réelle.

## Sprint E — robustesse locale

25. [x] `P1-TOOL-02` typecheck scripts, configs et E2E.
26. [x] `P2-DB-02` décision mesurée sur `run_attempts_finished_queue`.
27. [x] `P2-PERF-02` Web Vitals sur preview locale stable.
28. [ ] `P2-TEST-02` seeds variables reproductibles.
29. [ ] `P2-TEST-03` gate `skipLibCheck=false`.
30. [ ] `P2-WEB-02` fuzz de réhydratation et stockage navigateur.

## Sprint F — fiabilité produit et exploitation

31. [ ] `P1-SEC-03` frontière explicite des tables server-only.
32. [ ] `P1-RUN-02` UX des progressions rejetées.
33. [ ] `P1-RUN-03` traitement des attempts affectées par un bug client.
34. [ ] `P2-OBS-01` SLI/SLO techniques minimisés.
35. [ ] `P2-DOC-01` statuts recalculés et preuves exécutables.

## Sprint G — architecture et produit

36. [ ] `P2-CI-02` gates séparées par responsabilité, avec commande locale
    tout-en-un conservée.
37. [ ] `P3-PROD-01` historique de runs exploitable.
38. [ ] `P3-PROD-02` internationalisation anglaise.
39. [ ] `P3-PROD-03` décision PWA/offline.
40. [ ] `P3-PROD-04` enrichissement avec gate moteur.
40 bis. [ ] `P3-PROD-05` notes de mise à jour et nouveautés depuis la dernière visite.

## Sprint H — validations humaines et externes

41. [ ] `P3-A11Y-01` validation humaine multi-lecteurs d'écran.
42. [ ] `P3-LEGAL-01` blockers externes de diffusion.

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
- [ ] `balance:check` rejoue de vraies runs authority et vérifie le bundle/version/hash
  candidats, au lieu de parcourir synthétiquement tous les nœuds ;
- [ ] Daily officiel déterministe et identique entre un compte neuf et un compte maxé ;
- [ ] aucun starter à 0 % sur les premiers combats de la cohorte de release ;
- [ ] la cohorte de release n'est plus bloquée à 0 % de victoire par l'early Top ;
- [ ] distributions augments/drops et rendements économiques dans les tolérances
  versionnées de la baseline ;
- [x] règles cooldown/MP/ciblage/Electrocute couvertes en parité UI + authority ;
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
