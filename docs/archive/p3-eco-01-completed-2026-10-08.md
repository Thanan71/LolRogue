# P3-ECO-01 — checklist de livraison

Checklist du sprint H conservé après validation locale. Les activations dev/preview
ci-dessous ont été réalisées sur un Supabase local jetable et un build de production
local. Elles ne désignent pas un déploiement distant. Les preuves, versions et
limites sont dans [la validation](../champion-economy-validation-2026-10-08.md).
Le rollout distant conserve le flag OFF jusqu’aux contrôles opérateur documentés.

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

- [x] **Candies = maîtrise uniquement.** Ne jamais retirer des Candies lors d'un achat.
  Les seuils de maîtrise, le niveau, les statistiques et les cosmétiques restent
  indépendants de l'économie du roster.
- [x] **Éclats = monnaie globale du compte.** Une seule balance par identité
  authentifiée, avec historique append-only des gains/dépenses.
- [x] **Gold = monnaie de run uniquement.** Aucun transfert Gold ↔ Éclats/Candies.
- [x] Définir les champions gratuits permanents initiaux : **Garen, Annie, Ashe**.
- [x] Définir une rotation gratuite de **5 champions** parmi les champions implémentés
  et non gratuits permanents.
- [x] La rotation change **chaque lundi à 00:00 UTC** afin d'avoir une frontière
  temporelle unique et non dépendante de l'horloge locale du navigateur.
- [x] Fixer le prix initial de tous les champions achetables à **400 Éclats**. Le prix
  doit être une donnée versionnée/configurable et non une constante dispersée dans l'UI.
- [x] Ne pas introduire de tiers de prix tant que les données de progression ne
  démontrent pas qu'un prix unique pose problème.
- [x] Un champion possédé reste accessible même lorsqu'il quitte la rotation.
- [x] Un champion en rotation peut gagner des Candies et de la maîtrise normalement.
  Cette maîtrise reste acquise après la fin de la rotation.
- [x] Une rotation ne peut contenir qu'un champion réellement implémenté et autorisé
  par le gameplay ruleset actif.
- [x] Les Daily Runs doivent figer/snapshoter leur roster autorisé au démarrage afin
  qu'un changement de semaine ne modifie pas une tentative déjà créée.
- [x] Définir explicitement la politique de transition des comptes existants :
  **grandfathering recommandé** — les comptes créés avant l'activation du Sprint H
  conservent définitivement l'accès aux champions déjà disponibles à la date de
  migration. Enregistrer la source d'unlock `legacy_grant` pour distinguer ce cas
  des achats et des gratuits permanents.

### Économie des Éclats

Implémenter les récompenses uniquement à partir de runs **verified/authority** et
jamais à partir d'un compteur client.

Barème initial à versionner :

- [x] fin d'une run ayant validé au moins une vague : **+25 Éclats** ;
- [x] par biome terminé/validé : **+10 Éclats** ;
- [x] victoire : **+50 Éclats** ;
- [x] première victoire d'une période de rotation avec un champion actuellement en
  rotation : **+50 Éclats bonus**, au maximum une fois par champion et par période ;
- [x] abandon avant toute vague validée : **0 Éclat** ;
- [x] aucune multiplication par le nombre de champions de l'équipe ;
- [x] aucun bonus calculé depuis une valeur fournie par le client.

Le calcul final doit vivre dans une policy pure/versionnée côté moteur/serveur. Une
récompense d'Éclats doit référencer le `run_attempt_id`, le ruleset et la version
d'économie utilisés.

### Modèle de données Supabase — migration append-only

Créer les structures minimales suivantes, ou un modèle équivalent documenté :

- [x] `account_wallets`
  - `user_id uuid primary key references auth.users`;
  - `shards_balance bigint not null default 0 check (shards_balance >= 0)`;
  - `lifetime_shards_earned bigint not null default 0`;
  - `lifetime_shards_spent bigint not null default 0`;
  - `updated_at timestamptz not null`.
- [x] `shard_transactions` comme ledger append-only :
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
- [x] `account_champion_unlocks`
  - clé unique `(user_id, champion_id)`;
  - `unlocked_at`;
  - source : `purchase`, `legacy_grant`, `admin_grant` ;
  - prix payé ;
  - transaction associée si achat.
- [x] `champion_rotations`
  - identifiant stable de période, par exemple `2026-W42-v1`;
  - `starts_at`, `ends_at`;
  - `ruleset_version`;
  - seed/version d'algorithme si génération déterministe.
- [x] `champion_rotation_entries`
  - `rotation_id`;
  - `champion_id`;
  - ordre d'affichage ;
  - contrainte unique.
- [x] Si les prix sont persistés en base, créer un catalogue versionné avec
  `champion_id`, `price_shards`, `active_from`, `active_until`/version plutôt
  que de réécrire l'historique.

### Autorité, RLS et fonctions transactionnelles

- [x] Le client peut **lire** sa balance, ses unlocks et la rotation courante mais ne
  peut jamais écrire directement un solde, une transaction ou un unlock.
- [x] Les tables d'économie doivent avoir RLS activée et des policies minimales.
- [x] Le ledger ne doit offrir aucun `INSERT/UPDATE/DELETE` direct au rôle client.
- [x] Créer une fonction/RPC transactionnelle serveur
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
- [x] Deux clics simultanés, deux onglets ou un retry réseau ne doivent jamais créer
  deux débits.
- [x] Une récompense de run doit utiliser une clé d'idempotence liée à l'attempt :
  rejouer la requête de finalisation ne recrédite jamais la wallet.
- [x] Toute fonction `SECURITY DEFINER` ajoutée doit fixer son `search_path`,
  vérifier l'identité et suivre les contraintes déjà documentées du dépôt.
- [x] Les grants/privileges doivent être couverts par les contrôles
  `security-definer-privileges`/advisors existants.

### Rotation gratuite déterministe

- [x] Ne jamais calculer la rotation avec `Math.random()` dans le navigateur.
- [x] Définir une fonction pure de résolution
  `getRotationForInstant(serverNow, gameplayRulesetVersion)`.
- [x] La source canonique doit être soit :
  - des périodes matérialisées en base par une tâche/admin contrôlé ; soit
  - un algorithme déterministe versionné à seed stable, avec résultat vérifiable
    côté serveur.
- [x] Garantir exactement 5 champions lorsque le pool le permet.
- [x] Exclure les gratuits permanents de la rotation afin d'augmenter réellement le
  nombre de champions essayables.
- [x] Éviter autant que possible de répéter la même rotation deux semaines de suite ;
  la règle doit être déterministe et testée.
- [x] Une modification du catalogue en milieu de semaine ne doit pas changer
  rétroactivement la rotation en cours.
- [x] Conserver l'historique des rotations suffisamment longtemps pour auditer une
  run passée et son bonus de première victoire.
- [x] Tester explicitement les frontières `23:59:59Z → 00:00:00Z`, années ISO,
  semaines 52/53 et changement d'année.

### Contrat d'accès à un champion

Centraliser la décision dans une seule policy, par exemple :

`ChampionAccess = permanent_free | owned | weekly_rotation | locked`.

- [x] `permanent_free` : Garen/Annie/Ashe, toujours sélectionnables.
- [x] `owned` : unlock permanent du compte.
- [x] `weekly_rotation` : sélectionnable jusqu'à `rotation.ends_at`.
- [x] `locked` : visible mais non sélectionnable, avec prix et chemin d'achat.
- [x] Ne pas dupliquer cette logique entre StarterSelect, Database, store et backend.
- [x] L'authority de démarrage de run recalcule l'accès ; un payload client indiquant
  `owned=true` ou `free=true` n'a aucune valeur de sécurité.
- [x] Si une rotation expire entre l'ouverture du sélecteur et le clic « démarrer »,
  le serveur retourne une erreur métier explicite et l'UI recharge le roster.
- [x] Une tentative déjà créée conserve son snapshot d'équipe et reste rejouable même
  si la rotation expire ensuite.

### Expérience invité

Éviter une économie locale impossible à sécuriser ou à fusionner proprement :

- [x] un guest peut utiliser les champions gratuits permanents et la rotation ;
- [x] un guest peut gagner de la maîtrise locale selon les règles guest existantes ;
- [x] un guest **ne peut pas acheter durablement** un champion avec une wallet locale ;
- [x] afficher clairement que les Éclats et achats permanents nécessitent un compte ;
- [x] ne pas fusionner automatiquement une fausse balance locale dans un compte lors
  de l'inscription ;
- [x] si une récompense d'Éclats est affichée en guest, la présenter comme non
  persistée/indisponible ou ne pas l'accorder du tout ; choisir une seule politique
  et la tester.

### UI/UX — sélection et collection

- [x] Afficher la balance d'Éclats dans un emplacement stable hors combat.
- [x] Sur `StarterSelectPage`, distinguer visuellement sans dépendre uniquement de la
  couleur :
  - « Gratuit » ;
  - « Possédé » ;
  - « Rotation — X j/h restantes » ;
  - « Verrouillé — 400 Éclats ».
- [x] Ne jamais masquer les champions verrouillés : ils servent de catalogue et
  donnent un objectif de progression.
- [x] Ajouter filtre/tri : Tous, Disponibles, Possédés, Rotation, Verrouillés.
- [x] La fiche verrouillée doit permettre de consulter stats/sorts avant achat.
- [x] Ajouter confirmation d'achat avec champion, prix et balance avant/après.
- [x] Désactiver le bouton pendant la transaction et gérer retry proprement.
- [x] Après succès, rendre le champion sélectionnable immédiatement sans refresh.
- [x] En cas de solde insuffisant, afficher le montant manquant sans erreur générique.
- [x] En cas de prix modifié entre affichage et achat, ne jamais débiter l'ancien prix :
  rafraîchir le prix et demander une nouvelle confirmation.
- [x] Afficher la prochaine date de rotation calculée depuis la date serveur.
- [x] La page Database/collection doit indiquer l'état d'accès avec le même contrat.
- [x] Mobile : aucun badge/prix ne doit masquer portrait, nom ou action primaire.
- [x] Accessibilité : badges nommés, état `disabled`, focus après modal, annonces
  live du nouvel achat/solde, aucun verrou représenté uniquement par une icône.

### Conservation de la maîtrise

- [x] Les Candies restent attachées au champion, qu'il soit possédé ou en rotation.
- [x] Retirer un champion de la rotation ne supprime jamais sa maîtrise.
- [x] Acheter un champion ne modifie ni `totalCandies`, ni son niveau, ni ses unlocks
  de maîtrise.
- [x] Vérifier le cas : jouer un champion en rotation → gagner 183 Candies →
  rotation suivante → champion verrouillé → achat ultérieur → retrouver exactement
  183 Candies et les mêmes unlocks.
- [x] Séparer clairement dans les types et l'UI « maîtrise » et « propriété ».

### Récompense « première victoire de rotation »

- [x] Le bonus de +50 Éclats est attribué côté serveur uniquement après une victoire
  verified.
- [x] La clé d'unicité doit inclure `user_id + rotation_id + champion_id`.
- [x] Si plusieurs champions de rotation sont présents dans la même équipe victorieuse,
  définir et documenter la règle avant implémentation. Recommandation : bonus pour
  chaque champion de rotation de l'équipe dont le bonus n'a pas encore été réclamé,
  dans la limite naturelle de la taille d'équipe.
- [x] Un retry de finalisation ne redonne jamais le bonus.
- [x] Une défaite n'épuise pas l'éligibilité au bonus.
- [x] Un champion acheté pendant sa semaine de rotation reste éligible au bonus de
  première victoire de cette période s'il ne l'a pas encore obtenu.

### Migration / rétrocompatibilité

- [x] Créer les wallets existantes avec balance 0, sans inventer d'Éclats historiques
  à partir des Candies.
- [x] Ne jamais convertir rétroactivement Candies → Éclats.
- [x] Générer les `legacy_grant` avant d'activer les locks du StarterSelect afin de
  ne pas retirer brutalement des champions à un compte existant.
- [x] La migration doit être relançable/idempotente sur une copie restaurée.
- [x] Vérifier les comptes sans mastery, comptes avec progression partielle, comptes
  anciens et comptes nouvellement créés.
- [x] Mettre à jour les types Supabase générés dans le même changement.
- [x] Documenter la procédure de rollback : désactiver le feature flag ne doit pas
  supprimer wallet, transactions ou unlocks.

### Feature flag et rollout

- [x] Ajouter un flag serveur/config versionné `champion_economy_enabled`.
- [x] Tant que le flag est OFF, conserver exactement le comportement actuel.
- [x] Activer d'abord en environnement dev/preview avec comptes de test.
- [x] Exécuter migration + smoke tests + vérification RLS avant activation.
- [x] Tester la rotation sur au moins deux changements de période simulés.
- [x] Prévoir un kill-switch qui rend temporairement tous les champions implémentés
  accessibles sans modifier/supprimer les données d'économie.
- [x] Ne pas activer en prod si un mismatch de version catalogue/ruleset est détecté.

### Tests unitaires

- [x] calcul des récompenses Éclats : abandon, défaite, victoire, biomes, minimum ;
- [x] prix canonique et état d'accès ;
- [x] permanent free / owned / rotation / locked ;
- [x] expiration exacte d'une rotation ;
- [x] sélection des 5 champions et invariants de rotation ;
- [x] semaine ISO 52/53 et changement d'année ;
- [x] conservation de la maîtrise après lock/achat ;
- [x] bonus première victoire déjà réclamé/non réclamé ;
- [x] aucune interaction Candies ↔ Éclats ;
- [x] feature flag OFF = comportement historique.

### Tests base / intégration

- [x] RLS : un compte A ne lit/modifie jamais la wallet/unlocks privés du compte B ;
- [x] aucun client ne peut `UPDATE shards_balance` directement ;
- [x] achat avec 399/400/401 Éclats ;
- [x] achat d'un champion déjà possédé ;
- [x] double achat concurrent ;
- [x] retry avec même idempotency key ;
- [x] deux finalisations concurrentes de la même run ;
- [x] crédit de run uniquement pour attempt verified ;
- [x] absence de crédit pour payload falsifié/non autoritaire ;
- [x] transaction rollback complet si l'unlock échoue après le débit ;
- [x] historique ledger = variation de balance ;
- [x] aucune balance négative ;
- [x] grandfathering sans doublon ;
- [x] migration appliquée sur base vierge et base représentative restaurée.

### Tests E2E

- [x] nouveau compte : voit exactement 3 gratuits permanents + 5 de rotation lorsque
  le pool le permet ;
- [x] joueur sélectionne un champion de rotation et termine une run ;
- [x] Candies du champion de rotation augmentent ;
- [x] Éclats du compte augmentent après run verified ;
- [x] joueur achète un champion verrouillé et le sélectionne immédiatement ;
- [x] reload/logout-login conserve balance et ownership ;
- [x] simulation semaine suivante : ancien champion de rotation redevient verrouillé
  s'il n'a pas été acheté, mais sa maîtrise est conservée ;
- [x] champion acheté reste disponible après rotation ;
- [x] guest voit rotation mais pas d'achat permanent ;
- [x] mobile + clavier : achat et sélection entièrement utilisables.

### Observabilité et anti-abus

- [x] Journaliser côté serveur les refus d'achat : fonds insuffisants, prix obsolète,
  champion invalide, doublon ; sans exposer de données sensibles.
- [x] Ajouter métriques agrégées : Éclats gagnés/dépensés, temps médian avant premier
  achat, taux d'utilisation rotation, champions achetés, solde médian/p95.
- [x] Surveiller création anormale d'Éclats par run/account.
- [x] Alerter/tester si le ledger et la wallet divergent.
- [x] Prévoir une commande/admin de réconciliation **dry-run d'abord** ; aucune
  correction silencieuse.
- [x] Les ajustements admin doivent créer une transaction auditée et ne jamais
  modifier directement l'historique.

### Documentation à mettre à jour

- [x] `docs/progression-personalization.md` : Candies vs Éclats, ownership, rotation.
- [x] `docs/data-and-persistence.md` : autorité et nouvelles tables.
- [x] `docs/gameplay.md` : impact du roster sur le démarrage d'une run.
- [x] `docs/product-decisions.md` : décisions de prix/rotation/gratuits/guest.
- [x] `docs/feature-status.md` : statut réel et preuves.
- [x] `docs/legal-and-privacy.md` : préciser que les Éclats ne sont pas achetables
  contre de l'argent réel.
- [x] README si le parcours joueur ou l'architecture exposée change.

### Critères d'acceptation du Sprint H

Le sprint n'est terminé que si toutes les conditions suivantes sont vraies :

- [x] Candies et maîtrise existantes n'ont subi aucune régression ;
- [x] une nouvelle monnaie globale Éclats existe avec ledger serveur auditable ;
- [x] aucun client ne peut créer/modifier directement des Éclats ou unlocks ;
- [x] Garen, Annie et Ashe sont accessibles gratuitement en permanence ;
- [x] exactement 5 champions supplémentaires sont accessibles via la rotation
  hebdomadaire lorsque le pool le permet ;
- [x] tous les joueurs voient la même rotation pour une même période/ruleset ;
- [x] l'horloge locale du navigateur ne permet pas de changer la rotation ;
- [x] un champion acheté pour le prix canonique est débloqué définitivement ;
- [x] un double clic/retry/concurrence ne peut ni doubler le débit ni doubler le gain ;
- [x] la maîtrise d'un champion essayé en rotation survit à sa sortie de rotation ;
- [x] les comptes existants respectent la politique de grandfathering décidée ;
- [x] les guests ne créent pas de progression économique durable falsifiable ;
- [x] Daily/attempts existants restent déterministes grâce au snapshot d'accès ;
- [x] les migrations sont append-only, testées sur base vierge et restauration ;
- [x] types Supabase, tests unitaires, intégration DB, E2E et `npm run check` passent ;
- [x] la preview du SHA candidat valide achat, rotation, expiration et persistance ;
- [x] le feature flag/kill-switch a été testé ;
- [x] aucune monétisation réelle n'est introduite.

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
