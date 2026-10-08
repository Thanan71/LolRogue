# TODO — backlog actif de LolRogue

Nettoyage du backlog : **7 octobre 2026**. Les travaux terminés et les anciens
sprints sont conservés intégralement dans le [snapshot du 7 octobre](docs/archive/todo-snapshot-2026-10-07.md).
Le [snapshot avant réaudit du 8 août](docs/archive/todo-snapshot-2026-08-08-1837.md)
reste également disponible.

Ce fichier conserve les huit tâches ouvertes, leurs critères d'acceptation et les
gates de release. Les travaux livrés restent documentés dans Git,
[`docs/feature-status.md`](docs/feature-status.md) et les archives. L'archivage ne
constitue aucune preuve de déploiement ni de préparation à la bêta.

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

# Travail restant

## P0-I18N-01 — Internationalisation 100 % du projet (FR/EN)

**Taille : L**  
**Risque : élevé — une locale partielle rend le produit incohérent et invalide la promesse de traduction complète.**

### Périmètre obligatoire

La couverture doit porter sur **tout contenu visible ou annoncé à l'utilisateur**, pas
seulement les pages et boutons React :

- interface complète : navigation, menus, formulaires, paramètres, admin, erreurs,
  notifications, tutoriels, ARIA, titres de page et textes de chargement ;
- champions : titres, rôles, descriptions, textes de présentation, maîtrise,
  améliorations et tout contenu affiché dans la base des champions ;
- compétences : noms, descriptions, coûts, cooldowns/recharges, effets, ciblage,
  rangs, améliorations, tooltips, messages de combat et textes générés ;
- runes, augments, objets, passifs, raretés, statistiques et descriptions ;
- carte, biomes, encounters, combats, boutique, recrutement, repos, événements,
  trésors, récompenses, résultats de run et Daily ;
- contenus dynamiques issus des catalogues, Data Dragon, données persistées ou
  templates générés ;
- crédits, légal/confidentialité, patch notes et toute future fonctionnalité joueur ;
- formats dépendants de la locale : nombres, dates, pourcentages, pluriels et unités.

Les noms propres officiels qui ne se traduisent pas peuvent rester identiques entre
locales, mais aucun texte français ne doit servir de fallback silencieux dans la locale
anglaise.

### Actions

- [ ] Auditer manuellement desktop/mobile + lecteur d'écran pour les textes que le scan
  statique ne peut pas garantir.

Les travaux automatisés sont archivés dans le [snapshot du 7 octobre](docs/archive/todo-snapshot-2026-10-07.md) et documentés dans [la validation i18n Sprint G](docs/sprint-g-i18n.md).

La clôture du P0 reste conditionnée à l'audit humain avec lecteur d'écran et à une
preuve sur la preview du SHA candidat. Les tests automatisés et les captures du
navigateur ne constituent pas un audit humain de lecteur d'écran.

### Acceptation

- en locale anglaise : **0 texte français utilisateur**, y compris descriptions de
  champions, compétences, tooltips, contenus dynamiques, ARIA et messages d'erreur ;
- en locale française : **0 texte anglais accidentel** hors noms propres/termes
  explicitement conservés ;
- parité de clés et de catalogues FR/EN à 100 % ;
- aucun fallback silencieux vers le français lorsque `en` est sélectionné ;
- les gates i18n sont bloquantes en CI et échouent dès qu'un nouveau contenu joueur
  n'est pas traduit ;
- une vérification manuelle représentative confirme le résultat sur la preview du SHA
  candidat.

---

## P1-SEC-01 — Activer la protection contre les mots de passe compromis

**Taille : S**

**Différé par décision de coût :** ne pas activer cette option payante tant qu'elle
n'est pas souhaitée.

- [ ] Activer **Leaked Password Protection** dans Supabase Auth.
- [ ] Vérifier la politique minimale de longueur/complexité et les messages UI.
- [ ] Tester inscription et changement de mot de passe avec un mot de passe refusé.
- [ ] Documenter le réglage dans les runbooks d'environnement.
- [ ] Ajouter ce paramètre à la checklist de création/restauration d'un projet Supabase.

**Acceptation :** l'advisor `auth_leaked_password_protection` ne doit plus apparaître.

---

## P2-BAL-01 — Confronter les cohortes autoritaires aux playtests et au terrain

**Taille : M/L**

- [ ] Organiser des playtests humains par difficulté, taille d'équipe et expérience ;
  fixer ensuite les bandes de victoire Easy/Normal/Hard au lieu de les déduire de
  l'autoplay seul.

Les critères automatisés sont conservés dans le [snapshot du 7 octobre](docs/archive/todo-snapshot-2026-10-07.md).

### Acceptation

Une décision de tuning doit citer une cohorte autoritaire reproductible et un signal
de playtest/terrain compatible, avec taille d'échantillon et intervalle affichés.

**État au 4 septembre 2026 :** les sept critères automatisables sont livrés et testés.
Le playtest humain reste volontairement non coché et bloque l'acceptation : aucune
bande Easy/Normal/Hard ni fermeture de `P2-BAL-01` n'est déduite des bots ou des
agrégats terrain seuls.

---

## P2-CI-01 — Ajouter protection de branche et required checks vérifiables

**Taille : S/M**

Les protections de `main` et `dev` sont actives : le
[ruleset CI](https://github.com/Thanan71/LolRogue/rules/21537896) exige `validate`,
`e2e`, `database` et `clean-room`, avec branche à jour obligatoire. Les alias
stricts du sprint G conservent ces checks ; les actions sont épinglées par SHA et
leurs mises à jour sont proposées par Dependabot. Preuve :
[PR #197](https://github.com/Thanan71/LolRogue/pull/197), checks verts et état `CLEAN`.

Il reste à consigner le scénario négatif et à gérer les runs concurrents :

- [ ] Interdire le merge avec check annulé/neutralisé.
- [ ] Ajouter `concurrency` pour annuler les anciens runs d'une même PR sans annuler
  une release en cours.

Les alias exigent déjà la réussite de toutes leurs dépendances ; l'exercice
d'annulation ou de neutralisation sur une PR de contrôle reste à documenter.

---

## P2-OPS-01 — Tester les runbooks sur une vraie restauration isolée

**Taille : L**

Le dépôt documente les procédures, mais la preuve distante reste requise.

- [ ] Restaurer un backup sur un projet Supabase isolé distant. La répétition locale
  jetable est réussie ; la cible hébergée dédiée reste à fournir.

La répétition locale et les incidents simulés sont archivés dans le [snapshot du
7 octobre](docs/archive/todo-snapshot-2026-10-07.md). La preuve locale se trouve dans
[`docs/restore-drills/2026-08-12-local.json`](docs/restore-drills/2026-08-12-local.json) ;
elle ne clôture pas la restauration distante.

---


## P3-ECO-01 — Sprint H : roster possédé, rotation gratuite et monnaie globale « Éclats »

**Taille : L**  
**Risque : moyen/élevé — progression permanente, économie serveur et accès au roster ; une erreur d'autorité peut débloquer des champions gratuitement, dupliquer la monnaie ou rendre une run non reproductible.**

### Objectif produit

Mettre en place une boucle de progression longue durée qui permet d'augmenter le
nombre de champions jouables sans rendre tout le roster immédiatement disponible :

1. conserver les **Candies** comme progression de maîtrise propre à chaque champion ;
2. ajouter une monnaie globale permanente, les **Éclats**, indépendante de la maîtrise ;
3. laisser un petit noyau de champions gratuits en permanence ;
4. proposer une rotation gratuite hebdomadaire commune à tous les joueurs ;
5. permettre l'achat permanent des autres champions avec des Éclats gagnés en jeu ;
6. conserver la maîtrise déjà gagnée lorsqu'un champion quitte la rotation ;
7. rendre l'intégralité du système autoritaire, idempotent et reproductible côté serveur.

Le système doit rester **100 % non monétisé** : aucun achat en argent réel, aucune
conversion euro/Éclats, aucune publicité récompensée et aucun mécanisme assimilable à
une loot box. Les Éclats sont uniquement gagnés par le gameplay vérifié.

### Décisions de design à figer dans le contrat

- [ ] **Candies = maîtrise uniquement.** Ne jamais retirer des Candies lors d'un achat.
  Les seuils de maîtrise, le niveau, les statistiques et les cosmétiques restent
  indépendants de l'économie du roster.
- [ ] **Éclats = monnaie globale du compte.** Une seule balance par identité
  authentifiée, avec historique append-only des gains/dépenses.
- [ ] **Gold = monnaie de run uniquement.** Aucun transfert Gold ↔ Éclats/Candies.
- [ ] Définir les champions gratuits permanents initiaux : **Garen, Annie, Ashe**.
- [ ] Définir une rotation gratuite de **5 champions** parmi les champions implémentés
  et non gratuits permanents.
- [ ] La rotation change **chaque lundi à 00:00 UTC** afin d'avoir une frontière
  temporelle unique et non dépendante de l'horloge locale du navigateur.
- [ ] Fixer le prix initial de tous les champions achetables à **400 Éclats**. Le prix
  doit être une donnée versionnée/configurable et non une constante dispersée dans l'UI.
- [ ] Ne pas introduire de tiers de prix tant que les données de progression ne
  démontrent pas qu'un prix unique pose problème.
- [ ] Un champion possédé reste accessible même lorsqu'il quitte la rotation.
- [ ] Un champion en rotation peut gagner des Candies et de la maîtrise normalement.
  Cette maîtrise reste acquise après la fin de la rotation.
- [ ] Une rotation ne peut contenir qu'un champion réellement implémenté et autorisé
  par le gameplay ruleset actif.
- [ ] Les Daily Runs doivent figer/snapshoter leur roster autorisé au démarrage afin
  qu'un changement de semaine ne modifie pas une tentative déjà créée.
- [ ] Définir explicitement la politique de transition des comptes existants :
  **grandfathering recommandé** — les comptes créés avant l'activation du Sprint H
  conservent définitivement l'accès aux champions déjà disponibles à la date de
  migration. Enregistrer la source d'unlock `legacy_grant` pour distinguer ce cas
  des achats et des gratuits permanents.

### Économie des Éclats

Implémenter les récompenses uniquement à partir de runs **verified/authority** et
jamais à partir d'un compteur client.

Barème initial à versionner :

- [ ] fin d'une run ayant validé au moins une vague : **+25 Éclats** ;
- [ ] par biome terminé/validé : **+10 Éclats** ;
- [ ] victoire : **+50 Éclats** ;
- [ ] première victoire d'une période de rotation avec un champion actuellement en
  rotation : **+50 Éclats bonus**, au maximum une fois par champion et par période ;
- [ ] abandon avant toute vague validée : **0 Éclat** ;
- [ ] aucune multiplication par le nombre de champions de l'équipe ;
- [ ] aucun bonus calculé depuis une valeur fournie par le client.

Le calcul final doit vivre dans une policy pure/versionnée côté moteur/serveur. Une
récompense d'Éclats doit référencer le `run_attempt_id`, le ruleset et la version
d'économie utilisés.

### Modèle de données Supabase — migration append-only

Créer les structures minimales suivantes, ou un modèle équivalent documenté :

- [ ] `account_wallets`
  - `user_id uuid primary key references auth.users`;
  - `shards_balance bigint not null default 0 check (shards_balance >= 0)`;
  - `lifetime_shards_earned bigint not null default 0`;
  - `lifetime_shards_spent bigint not null default 0`;
  - `updated_at timestamptz not null`.
- [ ] `shard_transactions` comme ledger append-only :
  - identifiant ;
  - `user_id`;
  - montant signé ;
  - balance après transaction si retenu par le modèle ;
  - raison enum/versionnée : `run_reward`, `rotation_first_win`,
    `champion_purchase`, `legacy_adjustment`, `admin_adjustment` ;
  - `run_attempt_id` nullable mais obligatoire pour les récompenses de run ;
  - `champion_id` nullable selon la raison ;
  - `rotation_id` nullable ;
  - `idempotency_key` unique ;
  - date serveur.
- [ ] `account_champion_unlocks`
  - clé unique `(user_id, champion_id)`;
  - `unlocked_at`;
  - source : `purchase`, `legacy_grant`, `admin_grant` ;
  - prix payé ;
  - transaction associée si achat.
- [ ] `champion_rotations`
  - identifiant stable de période, par exemple `2026-W42-v1`;
  - `starts_at`, `ends_at`;
  - `ruleset_version`;
  - seed/version d'algorithme si génération déterministe.
- [ ] `champion_rotation_entries`
  - `rotation_id`;
  - `champion_id`;
  - ordre d'affichage ;
  - contrainte unique.
- [ ] Si les prix sont persistés en base, créer un catalogue versionné avec
  `champion_id`, `price_shards`, `active_from`, `active_until`/version plutôt
  que de réécrire l'historique.

### Autorité, RLS et fonctions transactionnelles

- [ ] Le client peut **lire** sa balance, ses unlocks et la rotation courante mais ne
  peut jamais écrire directement un solde, une transaction ou un unlock.
- [ ] Les tables d'économie doivent avoir RLS activée et des policies minimales.
- [ ] Le ledger ne doit offrir aucun `INSERT/UPDATE/DELETE` direct au rôle client.
- [ ] Créer une fonction/RPC transactionnelle serveur
  `purchase_champion(champion_id, expected_price/version)` ou équivalent qui :
  1. vérifie l'identité ;
  2. vérifie que le champion existe et est achetable ;
  3. vérifie qu'il n'est pas déjà possédé ;
  4. lit le prix canonique côté serveur ;
  5. verrouille la wallet/ligne nécessaire pour empêcher le double achat concurrent ;
  6. refuse si le solde est insuffisant ;
  7. débite exactement une fois ;
  8. écrit la transaction et l'unlock dans la même transaction SQL ;
  9. retourne le nouveau solde et l'état d'accès.
- [ ] Deux clics simultanés, deux onglets ou un retry réseau ne doivent jamais créer
  deux débits.
- [ ] Une récompense de run doit utiliser une clé d'idempotence liée à l'attempt :
  rejouer la requête de finalisation ne recrédite jamais la wallet.
- [ ] Toute fonction `SECURITY DEFINER` ajoutée doit fixer son `search_path`,
  vérifier l'identité et suivre les contraintes déjà documentées du dépôt.
- [ ] Les grants/privileges doivent être couverts par les contrôles
  `security-definer-privileges`/advisors existants.

### Rotation gratuite déterministe

- [ ] Ne jamais calculer la rotation avec `Math.random()` dans le navigateur.
- [ ] Définir une fonction pure de résolution
  `getRotationForInstant(serverNow, gameplayRulesetVersion)`.
- [ ] La source canonique doit être soit :
  - des périodes matérialisées en base par une tâche/admin contrôlé ; soit
  - un algorithme déterministe versionné à seed stable, avec résultat vérifiable
    côté serveur.
- [ ] Garantir exactement 5 champions lorsque le pool le permet.
- [ ] Exclure les gratuits permanents de la rotation afin d'augmenter réellement le
  nombre de champions essayables.
- [ ] Éviter autant que possible de répéter la même rotation deux semaines de suite ;
  la règle doit être déterministe et testée.
- [ ] Une modification du catalogue en milieu de semaine ne doit pas changer
  rétroactivement la rotation en cours.
- [ ] Conserver l'historique des rotations suffisamment longtemps pour auditer une
  run passée et son bonus de première victoire.
- [ ] Tester explicitement les frontières `23:59:59Z → 00:00:00Z`, années ISO,
  semaines 52/53 et changement d'année.

### Contrat d'accès à un champion

Centraliser la décision dans une seule policy, par exemple :

`ChampionAccess = permanent_free | owned | weekly_rotation | locked`.

- [ ] `permanent_free` : Garen/Annie/Ashe, toujours sélectionnables.
- [ ] `owned` : unlock permanent du compte.
- [ ] `weekly_rotation` : sélectionnable jusqu'à `rotation.ends_at`.
- [ ] `locked` : visible mais non sélectionnable, avec prix et chemin d'achat.
- [ ] Ne pas dupliquer cette logique entre StarterSelect, Database, store et backend.
- [ ] L'authority de démarrage de run recalcule l'accès ; un payload client indiquant
  `owned=true` ou `free=true` n'a aucune valeur de sécurité.
- [ ] Si une rotation expire entre l'ouverture du sélecteur et le clic « démarrer »,
  le serveur retourne une erreur métier explicite et l'UI recharge le roster.
- [ ] Une tentative déjà créée conserve son snapshot d'équipe et reste rejouable même
  si la rotation expire ensuite.

### Expérience invité

Éviter une économie locale impossible à sécuriser ou à fusionner proprement :

- [ ] un guest peut utiliser les champions gratuits permanents et la rotation ;
- [ ] un guest peut gagner de la maîtrise locale selon les règles guest existantes ;
- [ ] un guest **ne peut pas acheter durablement** un champion avec une wallet locale ;
- [ ] afficher clairement que les Éclats et achats permanents nécessitent un compte ;
- [ ] ne pas fusionner automatiquement une fausse balance locale dans un compte lors
  de l'inscription ;
- [ ] si une récompense d'Éclats est affichée en guest, la présenter comme non
  persistée/indisponible ou ne pas l'accorder du tout ; choisir une seule politique
  et la tester.

### UI/UX — sélection et collection

- [ ] Afficher la balance d'Éclats dans un emplacement stable hors combat.
- [ ] Sur `StarterSelectPage`, distinguer visuellement sans dépendre uniquement de la
  couleur :
  - « Gratuit » ;
  - « Possédé » ;
  - « Rotation — X j/h restantes » ;
  - « Verrouillé — 400 Éclats ».
- [ ] Ne jamais masquer les champions verrouillés : ils servent de catalogue et
  donnent un objectif de progression.
- [ ] Ajouter filtre/tri : Tous, Disponibles, Possédés, Rotation, Verrouillés.
- [ ] La fiche verrouillée doit permettre de consulter stats/sorts avant achat.
- [ ] Ajouter confirmation d'achat avec champion, prix et balance avant/après.
- [ ] Désactiver le bouton pendant la transaction et gérer retry proprement.
- [ ] Après succès, rendre le champion sélectionnable immédiatement sans refresh.
- [ ] En cas de solde insuffisant, afficher le montant manquant sans erreur générique.
- [ ] En cas de prix modifié entre affichage et achat, ne jamais débiter l'ancien prix :
  rafraîchir le prix et demander une nouvelle confirmation.
- [ ] Afficher la prochaine date de rotation calculée depuis la date serveur.
- [ ] La page Database/collection doit indiquer l'état d'accès avec le même contrat.
- [ ] Mobile : aucun badge/prix ne doit masquer portrait, nom ou action primaire.
- [ ] Accessibilité : badges nommés, état `disabled`, focus après modal, annonces
  live du nouvel achat/solde, aucun verrou représenté uniquement par une icône.

### Conservation de la maîtrise

- [ ] Les Candies restent attachées au champion, qu'il soit possédé ou en rotation.
- [ ] Retirer un champion de la rotation ne supprime jamais sa maîtrise.
- [ ] Acheter un champion ne modifie ni `totalCandies`, ni son niveau, ni ses unlocks
  de maîtrise.
- [ ] Vérifier le cas : jouer un champion en rotation → gagner 183 Candies →
  rotation suivante → champion verrouillé → achat ultérieur → retrouver exactement
  183 Candies et les mêmes unlocks.
- [ ] Séparer clairement dans les types et l'UI « maîtrise » et « propriété ».

### Récompense « première victoire de rotation »

- [ ] Le bonus de +50 Éclats est attribué côté serveur uniquement après une victoire
  verified.
- [ ] La clé d'unicité doit inclure `user_id + rotation_id + champion_id`.
- [ ] Si plusieurs champions de rotation sont présents dans la même équipe victorieuse,
  définir et documenter la règle avant implémentation. Recommandation : bonus pour
  chaque champion de rotation de l'équipe dont le bonus n'a pas encore été réclamé,
  dans la limite naturelle de la taille d'équipe.
- [ ] Un retry de finalisation ne redonne jamais le bonus.
- [ ] Une défaite n'épuise pas l'éligibilité au bonus.
- [ ] Un champion acheté pendant sa semaine de rotation reste éligible au bonus de
  première victoire de cette période s'il ne l'a pas encore obtenu.

### Migration / rétrocompatibilité

- [ ] Créer les wallets existantes avec balance 0, sans inventer d'Éclats historiques
  à partir des Candies.
- [ ] Ne jamais convertir rétroactivement Candies → Éclats.
- [ ] Générer les `legacy_grant` avant d'activer les locks du StarterSelect afin de
  ne pas retirer brutalement des champions à un compte existant.
- [ ] La migration doit être relançable/idempotente sur une copie restaurée.
- [ ] Vérifier les comptes sans mastery, comptes avec progression partielle, comptes
  anciens et comptes nouvellement créés.
- [ ] Mettre à jour les types Supabase générés dans le même changement.
- [ ] Documenter la procédure de rollback : désactiver le feature flag ne doit pas
  supprimer wallet, transactions ou unlocks.

### Feature flag et rollout

- [ ] Ajouter un flag serveur/config versionné `champion_economy_enabled`.
- [ ] Tant que le flag est OFF, conserver exactement le comportement actuel.
- [ ] Activer d'abord en environnement dev/preview avec comptes de test.
- [ ] Exécuter migration + smoke tests + vérification RLS avant activation.
- [ ] Tester la rotation sur au moins deux changements de période simulés.
- [ ] Prévoir un kill-switch qui rend temporairement tous les champions implémentés
  accessibles sans modifier/supprimer les données d'économie.
- [ ] Ne pas activer en prod si un mismatch de version catalogue/ruleset est détecté.

### Tests unitaires

- [ ] calcul des récompenses Éclats : abandon, défaite, victoire, biomes, minimum ;
- [ ] prix canonique et état d'accès ;
- [ ] permanent free / owned / rotation / locked ;
- [ ] expiration exacte d'une rotation ;
- [ ] sélection des 5 champions et invariants de rotation ;
- [ ] semaine ISO 52/53 et changement d'année ;
- [ ] conservation de la maîtrise après lock/achat ;
- [ ] bonus première victoire déjà réclamé/non réclamé ;
- [ ] aucune interaction Candies ↔ Éclats ;
- [ ] feature flag OFF = comportement historique.

### Tests base / intégration

- [ ] RLS : un compte A ne lit/modifie jamais la wallet/unlocks privés du compte B ;
- [ ] aucun client ne peut `UPDATE shards_balance` directement ;
- [ ] achat avec 399/400/401 Éclats ;
- [ ] achat d'un champion déjà possédé ;
- [ ] double achat concurrent ;
- [ ] retry avec même idempotency key ;
- [ ] deux finalisations concurrentes de la même run ;
- [ ] crédit de run uniquement pour attempt verified ;
- [ ] absence de crédit pour payload falsifié/non autoritaire ;
- [ ] transaction rollback complet si l'unlock échoue après le débit ;
- [ ] historique ledger = variation de balance ;
- [ ] aucune balance négative ;
- [ ] grandfathering sans doublon ;
- [ ] migration appliquée sur base vierge et base représentative restaurée.

### Tests E2E

- [ ] nouveau compte : voit exactement 3 gratuits permanents + 5 de rotation lorsque
  le pool le permet ;
- [ ] joueur sélectionne un champion de rotation et termine une run ;
- [ ] Candies du champion de rotation augmentent ;
- [ ] Éclats du compte augmentent après run verified ;
- [ ] joueur achète un champion verrouillé et le sélectionne immédiatement ;
- [ ] reload/logout-login conserve balance et ownership ;
- [ ] simulation semaine suivante : ancien champion de rotation redevient verrouillé
  s'il n'a pas été acheté, mais sa maîtrise est conservée ;
- [ ] champion acheté reste disponible après rotation ;
- [ ] guest voit rotation mais pas d'achat permanent ;
- [ ] mobile + clavier : achat et sélection entièrement utilisables.

### Observabilité et anti-abus

- [ ] Journaliser côté serveur les refus d'achat : fonds insuffisants, prix obsolète,
  champion invalide, doublon ; sans exposer de données sensibles.
- [ ] Ajouter métriques agrégées : Éclats gagnés/dépensés, temps médian avant premier
  achat, taux d'utilisation rotation, champions achetés, solde médian/p95.
- [ ] Surveiller création anormale d'Éclats par run/account.
- [ ] Alerter/tester si le ledger et la wallet divergent.
- [ ] Prévoir une commande/admin de réconciliation **dry-run d'abord** ; aucune
  correction silencieuse.
- [ ] Les ajustements admin doivent créer une transaction auditée et ne jamais
  modifier directement l'historique.

### Documentation à mettre à jour

- [ ] `docs/progression-personalization.md` : Candies vs Éclats, ownership, rotation.
- [ ] `docs/data-and-persistence.md` : autorité et nouvelles tables.
- [ ] `docs/gameplay.md` : impact du roster sur le démarrage d'une run.
- [ ] `docs/product-decisions.md` : décisions de prix/rotation/gratuits/guest.
- [ ] `docs/feature-status.md` : statut réel et preuves.
- [ ] `docs/legal-and-privacy.md` : préciser que les Éclats ne sont pas achetables
  contre de l'argent réel.
- [ ] README si le parcours joueur ou l'architecture exposée change.

### Critères d'acceptation du Sprint H

Le sprint n'est terminé que si toutes les conditions suivantes sont vraies :

- [ ] Candies et maîtrise existantes n'ont subi aucune régression ;
- [ ] une nouvelle monnaie globale Éclats existe avec ledger serveur auditable ;
- [ ] aucun client ne peut créer/modifier directement des Éclats ou unlocks ;
- [ ] Garen, Annie et Ashe sont accessibles gratuitement en permanence ;
- [ ] exactement 5 champions supplémentaires sont accessibles via la rotation
  hebdomadaire lorsque le pool le permet ;
- [ ] tous les joueurs voient la même rotation pour une même période/ruleset ;
- [ ] l'horloge locale du navigateur ne permet pas de changer la rotation ;
- [ ] un champion acheté pour le prix canonique est débloqué définitivement ;
- [ ] un double clic/retry/concurrence ne peut ni doubler le débit ni doubler le gain ;
- [ ] la maîtrise d'un champion essayé en rotation survit à sa sortie de rotation ;
- [ ] les comptes existants respectent la politique de grandfathering décidée ;
- [ ] les guests ne créent pas de progression économique durable falsifiable ;
- [ ] Daily/attempts existants restent déterministes grâce au snapshot d'accès ;
- [ ] les migrations sont append-only, testées sur base vierge et restauration ;
- [ ] types Supabase, tests unitaires, intégration DB, E2E et `npm run check` passent ;
- [ ] la preview du SHA candidat valide achat, rotation, expiration et persistance ;
- [ ] le feature flag/kill-switch a été testé ;
- [ ] aucune monétisation réelle n'est introduite.

**Ordre d'implémentation recommandé :**

1. figer contrat produit et prix/rotation/guest/grandfathering ;
2. migrations + RLS + ledger + wallets + unlocks ;
3. policy pure d'accès et rotation déterministe ;
4. récompenses Éclats sur finalisation authority idempotente ;
5. RPC transactionnelle d'achat ;
6. repositories/services/stores et types ;
7. StarterSelect + Database/collection + UX achat ;
8. bonus première victoire de rotation ;
9. migration/grandfathering et feature flag ;
10. tests unitaires/DB/E2E, sécurité et concurrence ;
11. documentation, métriques, preview et activation progressive.

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

# Inventaire des invariants P0 livrés

Ces dix identifiants restent visibles pour que `release:preflight` conserve son
inventaire de onze P0, avec `P0-I18N-01` encore ouvert ci-dessus. Les titres ne
prouvent ni la validation du SHA candidat ni l'état live : la fiche
`config/beta-release.json` et ses contrôles restent obligatoires.

## P0-SEC-01 — Corriger les vues leaderboard `SECURITY DEFINER`

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-SEC-02 — Réduire et formaliser la surface `SECURITY DEFINER`

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-RUN-01 — Supprimer la duplication manuelle des versions authority

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-DATA-01 — Tester les repositories contre une vraie base

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-REL-01 — Réparer la gate bêta pour qu'elle reflète l'état réel

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-BAL-01 — Corriger les incohérences fondamentales du moteur de combat

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-BAL-02 — Remplacer la fausse simulation de balance par de vraies runs

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-BAL-03 — Garantir l'égalité des règles Daily et des départs comparables

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-BAL-04 — Rétablir la hiérarchie augments/drops et couper le snowball économique

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-BAL-05 — Débloquer l'early Top avant le tuning structurel

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

# 2. Ordre d'exécution recommandé

1. `P0-I18N-01` : audit humain FR/EN avec lecteur d'écran sur la preview du SHA candidat.
2. `P2-BAL-01` : playtests humains et calibration des bandes Easy/Normal/Hard.
3. `P2-OPS-01` : restauration d'un backup sur un projet Supabase hébergé isolé.
4. `P3-A11Y-01` : validation humaine multi-lecteurs d'écran, zoom et clavier.
5. `P3-LEGAL-01` : fermeture des blockers externes de diffusion.

Le chantier `P3-ECO-01` est un sprint produit détaillé non bloquant pour la bêta technique actuelle : il doit être réalisé avant d'élargir fortement le roster jouable afin d'éviter une migration tardive de l'économie. Les travaux différés `P1-SEC-01` et les deux actions restantes de `P2-CI-01` restent
ouverts selon les décisions ci-dessous. Les sprints déjà livrés
sont archivés ; l'internationalisation n'apparaît qu'une fois dans cet ordre.

## Décisions et travaux différés

- `P1-SEC-01` reste visible mais ne doit pas activer Leaked Password Protection
  tant que cette option payante n'est pas souhaitée.
- `P2-CI-01` conserve l'exercice d'annulation/neutralisation et la gestion des
  runs concurrents. Les protections et les required checks distants sont actifs.
- Les autres tâches utilisent `npm run check`, `npm run db:validate` et les gates
  locales spécialisées comme preuves. Les checks requis de la branche cible
  conditionnent le merge des PR.

---

# 3. Nouvelle gate de bêta proposée

La bêta technique ne redevient candidate que lorsque :

- [ ] aucun `P0-*` n'est ouvert ;
- [ ] internationalisation FR/EN à 100 %, y compris champions, compétences et contenus dynamiques ;
- [ ] advisors sécurité live : aucune `ERROR` non acceptée ;
- [ ] aucune fonction de trigger/maintenance inutile n'est client-callable ;
- [ ] repository integration tests passent contre une vraie base migrée ;
- [ ] dernière migration live = migration attendue par le SHA candidat ;
- [ ] trois CI complètes consécutives **après** le dernier P0 ;
- [ ] preview du SHA candidat validée, pas une ancienne prod ;
- [ ] taux de rejet authority vérifié après déploiement du correctif ;
- [x] `balance:check` rejoue de vraies runs authority et vérifie le bundle/version/hash
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
