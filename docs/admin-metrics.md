# Contrat des métriques admin

ADM-S1 accompagne l'application **0.2.7**. Le moteur reste
`run-engine-0.2.5` : règles, identités et bundles historiques ne changent pas.
La migration requise est
[`20261017042727_admin_metrics_candy_ledger.sql`](../supabase/migrations/20261017042727_admin_metrics_candy_ledger.sql).
Elle est validée localement ; **son application distante n'est pas réalisée par
ce chantier**. Validation locale, CI, fusion et déploiement sont des étapes distinctes.

## Source et populations

[`public.admin_stats`](../supabase/migrations/20261017042727_admin_metrics_candy_ledger.sql)
publie quinze lignes `stat_name` / `stat_value`, cette dernière étant du texte
nullable. La vue est un agrégat SQL vivant, sans cache applicatif ni somme des
premières lignes chargées. Le
[dictionnaire FR/EN de l'interface](../src/features/administration/domain/adminMetrics.ts)
expose formule, source, unité, période, population et politique de vérification.

Les notations de la table ci-dessous sont :

- **P** : profils encore présents dans `public.players`, une ligne par compte.
  Administrateurs et comptes de test sont inclus ; aucun filtre bots/tests n'est
  appliqué. Les invités uniquement locaux, sans profil persistant, sont exclus.
- **R** : lignes encore présentes dans `public.runs`, distinctes des tentatives
  `run_attempts`. **D** : lignes encore présentes dans `public.daily_runs`.
- **L(P)** : événements `candy_transactions` rattachés à P et leurs
  `candy_accounts`. La suppression d'un compte supprime aussi ces données personnelles.
- **E**, **S**, **F** : respectivement somme des montants `earned`, opposé de la
  somme des montants négatifs `spent`, somme des montants `refunded`, sur L(P).

Les dates de référence sont UTC. Les totaux sans fenêtre journalière portent sur
les données persistées actuelles, et peuvent diminuer lors d'un effacement.
Les parties sauvegardées, résultats Daily, tentatives authority et comptes sont
des populations différentes ; leurs nombres ne forment pas un même entonnoir.
Les agrégats authority existants restent définis par minute de `started_at` et
par statut/version ; ils ne sont pas des totaux de runs terminées.

## Les quinze clés

Dans cette table, « zéro » désigne une valeur SQL connue, y compris une population
vide. Une clé absente, un `NULL`, une réponse invalide ou une requête en échec ne
doivent jamais être remplacés par zéro.

| Clé | Source et formule | Unité | Population | Fenêtre / vérification | Valeur inconnue |
| --- | --- | --- | --- | --- | --- |
| `total_players` | `COUNT(*)` de `players` | comptes | P | Instant courant ; aucun filtre d'activité | Zéro si P vide ; absence/erreur indisponible |
| `active_today` | `COUNT(*)` de `players` dont `last_login_at` appartient au jour UTC | comptes | P, une fois par compte | `[00:00 UTC, 00:00 UTC suivant)` ; connexion enregistrée par le serveur | Zéro pour une journée vide ; clé absente indisponible |
| `total_runs` | `COUNT(*)` de `runs` | parties sauvegardées | R | Toutes dates ; aucun filtre `progression_source = 'verified'` | Zéro si R vide |
| `total_daily_runs` | `COUNT(*)` de `daily_runs` | résultats Daily | D | Toutes dates ; aucun filtre verified, validité du score ou état de fin ajouté par cette vue | Zéro si D vide |
| `total_wins` | `COALESCE(SUM(players.total_wins), 0)` | victoires | P | Compteurs persistés ; aucun filtre verified ni recalcul sur R | Zéro si P vide |
| `total_candies_balance` | `COALESCE(SUM(players.total_candies), 0)` | Candies | P | Solde dépensable actuel, pas un gain cumulé | Zéro si P vide |
| `total_candies_earned` | E, seulement si historique complet et réconcilié | Candies gagnés | L(P) | À vie des comptes présents ; crédits de runs vérifiées | `NULL` si un compte est incomplet, absent du ledger ou non réconcilié |
| `total_candies_spent` | S, avec la même condition de complétude | Candies dépensés | L(P) | À vie ; achats canoniques d'améliorations | Même condition de `NULL` |
| `total_candies_refunded` | F, avec la même condition de complétude | Candies remboursés | L(P) | À vie ; événements internes autorisés de remboursement | Même condition de `NULL` |
| `candies_earned_since_ledger` | E | Candies gagnés | L(P) | Depuis l'installation du ledger ; crédit final vérifié uniquement | Zéro si aucun crédit classifié ; marqueur ledger absent/invalide : UI indisponible |
| `candies_spent_since_ledger` | S | Candies dépensés | L(P) | Depuis l'installation ; achats canoniques | Zéro si aucun débit classifié ; même garde UI |
| `candies_refunded_since_ledger` | F | Candies remboursés | L(P) | Depuis l'installation ; remboursements internes | Zéro si aucun remboursement ; même garde UI |
| `candies_history_incomplete_accounts` | Nombre de P sans `candy_accounts`, ou avec `history_complete = false` | comptes | P | État actuel ; ne dépend pas d'un filtre verified | Zéro signifie historique complet pour tous les comptes présents |
| `candies_unreconciled_accounts` | Nombre de P sans compte ledger, ou dont le solde diffère de l'ouverture + somme des événements | comptes | P | État actuel ; comparaison serveur | Zéro signifie réconciliation, pas complétude historique |
| `candies_ledger_started_at` | `candy_ledger_settings.started_at`, ligne singleton | horodatage UTC | Installation du ledger | Date fixe de la migration, sérialisée en ISO UTC | Absence, `NULL` ou date invalide : indisponible |

`active_today` mesure les **connexions enregistrées**, pas toutes les actions
effectuées dans une session persistante. Sa source est `last_login_at`, alimentée
côté serveur, notamment par `touch_player_last_login()`. Plusieurs connexions d'un
même compte ne créent pas plusieurs profils à compter. Les bornes UTC sont
explicites, indépendamment du fuseau de la session SQL ou du navigateur.

Les montants « depuis le ledger » additionnent toutes ses lignes classifiées ;
la vue n'ajoute pas de filtre `created_at`. Ce périmètre vient de l'installation
du ledger et de ses écritures protégées. Le marqueur de démarrage n'est ni une
estimation du premier gain du joueur ni une date de version applicative.

## Candies : conservation et limites de l'historique

Pour chaque compte, l'égalité vérifiée au commit est :

```text
solde actuel = solde d'ouverture + gagnés - dépensés + remboursés + ajustements non attribués
```

`opening_balance` est une photographie du solde au déploiement, **pas une preuve
de gains ou de dépenses antérieurs**. Tous les comptes existants sont initialisés
avec `history_complete = false`, même ceux dont le solde vaut zéro. Un nouveau
compte ouvrant à zéro peut avoir un historique complet depuis sa création.

Une modification de solde hors des événements métier connus est réconciliée par
un événement signé `unattributed` et rend l'historique incomplet. Elle n'est jamais
classée comme un gain, une dépense ou un remboursement par simple observation du
delta. Le passage à `false` est irréversible tant que le compte existe, même si
son solde revient à zéro. Une réconciliation correcte ne rétablit pas cet historique.

Les trois totaux « à vie » sont `NULL` dès qu'un compte présent a un historique
incomplet ou non réconcilié. Les totaux classifiés depuis le ledger et le solde
restent des mesures distinctes ; ils ne reconstituent pas les opérations manquantes.
Les Candies dépensables ne sont ni la maîtrise des champions ni les Éclats et
ne réutilisent pas `shard_transactions`.

L'effacement d'un compte cascade vers `candy_accounts` et `candy_transactions`.
Les sommes deviennent donc celles des **comptes encore présents**, y compris pour
les gains à vie et les événements depuis le ledger. Elles ne mesurent pas toutes
les émissions historiques incluant les comptes effacés. Aucun historique personnel
supplémentaire n'est conservé pour empêcher cette diminution.

L'[export de compte opérateur](release-and-support.md#export-de-compte) inclut
les ouvertures et événements de ce seul joueur via `players.id`. La configuration
globale `candy_ledger_settings` n'est pas une donnée personnelle à exporter.

## Garanties d'écriture

- Le snapshot d'ouverture et l'installation des gardes partagent une transaction
  qui verrouille les écritures sur `players`.
- Achats et récompenses gardent leurs signatures et autorisations publiques.
  Le débit/crédit, l'amélioration ou la run et l'événement ledger sont atomiques :
  une erreur annule l'ensemble.
- `(player_id, source_key)` est unique. Les clés `purchase:<command_id>`,
  `run:<run_id>` et `refund:<command_id>` identifient leurs opérations. Un retry
  compatible ne recompte pas l'événement ; réutiliser une clé avec un autre type
  ou montant est refusé.
- Les récompenses enregistrent uniquement le montant canonique final d'une run
  vérifiée. Une tentative rejetée n'émet pas de gain ; un gain nul ne crée pas
  d'événement de montant zéro. Les corrections intermédiaires des anciennes
  fonctions ne deviennent pas des crédits additionnels.
- La réconciliation est une contrainte différée qui relit le solde final sous
  verrou. Aucun GUC contrôlé par l'appelant ne constitue une preuve de provenance.
- Les transactions et ouvertures sont protégées contre la réécriture, avec
  l'exception de cascade nécessaire à l'effacement du compte. Les rôles API
  n'ont pas d'écriture directe sur les trois tables du ledger.

`private.refund_candies` est une primitive interne, testée pour concurrence,
idempotence et rollback. **ADM-S1 ne livre aucune action publique de remboursement,
de reset d'arbre ni le parcours TREE-07**. Son futur appelant devra définir ses
autorisations et sa propre opération métier ; aucun droit client n'est ajouté ici.

## Matrice d'accès

L'autorité est `players.is_admin`, lue par `is_current_user_admin()` pour le
`auth.uid()` courant. Des metadata JWT fournies par le client ne donnent aucun
privilège. Le garde React est une protection de navigation, pas la barrière SQL.

| Rôle effectif | `admin_stats` / `admin_player_stats`, lignes et counts | Tables Candies, lignes et counts | Écriture directe des métriques / ledger |
| --- | --- | --- | --- |
| `anon` | Refus, aucune donnée ni total | Refus | Refus |
| `authenticated` non-admin | Résultat vide, count zéro | Résultat vide, count zéro, même pour son propre compte | Refus |
| `authenticated` admin | Lecture autorisée de la population complète | Lecture autorisée par RLS | Refus ; les opérations métier restent celles des RPC existantes |
| `service_role` sans session utilisateur | Pas d'identité admin implicite ; lecture des vues refusée | SELECT explicitement autorisé | Refus sur les tables ledger et la vue ; rôle réservé au serveur |

Les vues appliquent `security_invoker` et la condition admin ; `admin_stats`
ajoute `security_barrier`. Les tables activent RLS et leurs policies SELECT sont
réservées aux admins authentifiés. Les helpers privés et anciennes fonctions
internes déplacées n'accordent pas EXECUTE à `PUBLIC`, `anon`, `authenticated`
ou `service_role`. Les wrappers publics conservent leurs grants antérieurs.

Une révocation admin dans `players` prend effet sur les requêtes suivantes avec
le **même JWT**, sans attendre son renouvellement. La clé service ne doit jamais
être livrée au navigateur. Le service peut encore exercer les opérations serveur
existantes, notamment des ajustements de `players.total_candies` : ceux qui ne
proviennent pas d'un événement canonique deviennent `unattributed`.

## Affichage, ancienne vue et listes bornées

Avant la migration, l'ancienne vue nommait `total_candies_earned` la somme des
soldes. **Le frontend 0.2.7 doit afficher « Indisponible » pour cette ancienne
valeur**, même si elle est numérique. `getAdminMetricValue` exige un marqueur
ledger valide pour les gains/dépenses/remboursements, et des compteurs de couverture
à zéro pour les totaux à vie. La version de l'application seule ne prouve pas que
la base est migrée. Les autres nouvelles clés absentes sont également indisponibles.

Un zéro SQL valide reste zéro. Une valeur vide, négative, non entière, non finie,
une date invalide, une clé absente ou `NULL` sont indisponibles. Les entiers reçus
comme texte sont formatés avec `BigInt`, sans arrondi par conversion en `Number`.
La date du ledger est affichée explicitement en UTC. Les définitions sont
consultables dans chaque carte, en français et en anglais.

Les sections se chargent et se réessaient indépendamment. Une réponse obsolète
est ignorée ; les changements de compte, de droits connus du client et de filtres
invalident leur portée.
Un échec de rafraîchissement peut conserver les données avec un état périmé visible.
Une erreur de permission purge ces données privilégiées. Une panne n'est pas un
état vide réussi et ne remplace pas les valeurs par zéro.

Les [lectures joueurs](../src/features/administration/infrastructure/players/adminPlayerQueries.ts),
[lectures de runs](../src/features/administration/infrastructure/runs/adminRunQueries.ts)
et [diagnostics](../src/features/administration/infrastructure/diagnostics/adminDiagnosticsClient.ts)
utilisent leurs RPC dédiées et des projections validées. Le total correspond à
la population SQL autorisée et filtrée ; la taille de la page reste distincte.
Les curseurs sont liés aux filtres et au snapshot, avec un tri stable complété
par l'ID. Un total absent, invalide ou inférieur aux lignes retournées fait
échouer la lecture ; il n'est remplacé ni par zéro ni par `rows.length`.

L'interface affiche « lignes affichées / total filtré », par exemple 100 / 1 001.
Les totaux des cartes ne viennent jamais des seules lignes affichées. Une
équipe ou une projection incomplète est refusée par le contrat concerné.

Le CSV conserve sa protection contre les formules. Sa confirmation distingue la
page affichée de la population filtrée complète, bornée à 5 000 résultats ; sa
portée et sa période sont explicites. Le serveur refuse la troncature. Les
lignes conservées après un échec de refresh gardent leur état périmé visible ;
aucun export ne constitue une photographie globale de la base à un autre instant.

Le comportement historique reste documenté dans la
[validation ADM-S1](admin-s1-validation-2026-10-17.md). Depuis **0.2.8**, pagination
et exports suivent le [contrat ADM-S2](admin-explorer.md). L'interface et les
frontières de code suivent désormais le [contrat ADM-S7](admin-interface.md).

## Vérifications et état de livraison

Les durées et compteurs des suites S1 ci-dessous conservent leur référence du
17 octobre. La [validation S7](admin-s7-validation-2026-10-21.md) documente la
campagne globale actuelle et la séparation entre preuve locale et livraison.

- [`adminVolume.database.test.ts`](../tests/adminVolume.database.test.ts) vérifie
  les volumes 0/100/101/1 000/1 001 en parcourant toutes les pages, sans doublon,
  avec métrique globale concordante. Les
  [contrats d’exploration SQL](../tests/adminExplorer.database.test.ts) et
  [tests de l’interface joueurs](../tests/adminPlayersExplorer.test.tsx) couvrent
  filtres, curseurs, annulation, projections incomplètes et changements de contexte.
- [`adminReliability.test.tsx`](../tests/adminReliability.test.tsx) couvre les
  quinze clés FR/EN, l'ancienne vue trompeuse, absence/`NULL`/zéro, états indépendants,
  retry/stale, filtres obsolètes, déconnexion et portée de compte. Le CSV garde ses
  [tests dédiés](../tests/adminCsv.test.ts).
- [`adminMetrics.database.test.ts`](../tests/adminMetrics.database.test.ts) :
  **15/15 PASS localement, zéro skip, 4,06 s**. UTC/journée vide, exact counts,
  maîtrise séparée, historique incomplet irréversible, achats/récompenses/refunds
  concurrents, replay, rejet, montant nul et rollback.
- [`adminMetricsPrivileges.database.test.ts`](../tests/adminMetricsPrivileges.database.test.ts)
  et les suites admin/SECURITY DEFINER existantes : **15/15 PASS localement dans
  trois fichiers, zéro skip, 2,02 s**. Les sept nouveaux cas couvrent les quatre
  rôles, la révocation avec le même JWT, les counts et 36 mutations ledger refusées.
  Un PATCH de la vue UNION peut retourner `55000` même avec les droits révoqués :
  le test exige un refus précis et une valeur inchangée ; les mutations ledger
  exigent `42501`. Les ACL de la vue sont vérifiées séparément en SQL local.

La preuve de migration locale conserve deux comptes antérieurs, avec soldes
d'ouverture 137 et 0 : tous deux ont un historique incomplet, sans événement de
gain inventé. Rapports temporaires :
`/tmp/lolrogue-adm-s1-legacy-migration-proof.json`,
`/tmp/lolrogue-adm-s1-admin-metrics-db.log` et
`/tmp/lolrogue-adm-s1-security-live.log`.

Ces résultats sont des preuves **locales du candidat**, pas une CI verte, une
preuve de migration distante ni une autorisation de déploiement. Les résultats
complets et le SHA testé sont consignés dans la validation et la PR de la tranche.
