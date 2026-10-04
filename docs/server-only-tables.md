# Frontière Data API des tables public

Contrat P1-SEC-03, revue du 4 octobre 2026.

`config/public-table-access.json` classe chaque table applicative du schéma
`public`. « Data API client » signifie qu’au moins un rôle client dispose d’un
accès direct, éventuellement limité à certaines colonnes ou aux administrateurs.
RLS continue de filtrer les lignes. « Interne » signifie aucun privilège de table
ou de colonne pour `PUBLIC`, `anon` ou `authenticated`, même pour un utilisateur
administrateur ; seules les fonctions autorisées et `service_role` y accèdent.
La présence dans `public`, schéma exposé, ne constitue pas à elle seule un grant.

| Table `public` | Frontière | Usage autorisé |
| --- | --- | --- |
| `champion_enhancements` | Data API client | Lecture des améliorations du compte sous RLS ; achats via RPC autoritaire. |
| `champion_mastery` | Data API client | Lecture des maîtrises autorisées sous RLS ; récompenses validées côté serveur. |
| `daily_challenge_rulesets` | Interne | Catalogue du Daily lu par get_daily_challenge et les RPC de démarrage ; aucune lecture client directe. |
| `daily_runs` | Data API client | Lecture personnelle et administration sous RLS ; résultat écrit après vérification serveur. |
| `daily_score_invalidation_audit` | Data API client | Lecture administrative sous RLS ; écriture par la RPC de modération auditée. |
| `daily_score_reports` | Data API client | Signalement lié au compte et lecture administrative sous RLS. |
| `enhancement_node_catalog` | Data API client | Catalogue des améliorations lisible par les comptes authentifiés sous RLS. |
| `gameplay_content_catalog` | Data API client | Contenu actif lisible par les comptes authentifiés sous RLS. |
| `gameplay_rulesets` | Data API client | Versions de gameplay lisibles par les comptes authentifiés sous RLS. |
| `leaderboard_seasons` | Data API client | Saisons publiques lisibles par anon et authenticated sous RLS. |
| `logs` | Data API client | Lecture et purge administratives sous RLS ; ingestion minimisée via submit_client_logs. |
| `player_unlocks` | Data API client | Lecture des déblocages du compte sous RLS ; progression écrite côté serveur. |
| `players` | Data API client | Profil personnel et lecture administrative sous RLS ; édition bornée des colonnes du profil. |
| `progression_champion_catalog` | Data API client | Catalogue des champions lisible par les comptes authentifiés sous RLS. |
| `progression_commands` | Interne | Journal idempotent des achats, lu et écrit par unlock_champion_enhancement ; aucun accès client direct. |
| `progression_enhancement_security_baselines` | Interne | Quarantaine historique des rangs non attestés conservée pour audit serveur ; aucun accès client direct. |
| `progression_rulesets` | Data API client | Versions de progression lisibles par les comptes authentifiés sous RLS. |
| `progression_security_baselines` | Data API client | Politique de migration historique publiable, lisible par authenticated sous RLS ; distincte de la quarantaine personnelle des améliorations. |
| `run_attempt_commands` | Data API client | Lecture du journal de sa tentative sous RLS ; ajout via append_run_attempt_commands. |
| `run_attempts` | Data API client | Lecture propriétaire et administrative sous RLS ; cycle de vie modifié via les RPC autoritaires. |
| `run_team_members` | Data API client | Lecture des équipes des runs autorisés sous RLS ; écriture après vérification serveur. |
| `runs` | Data API client | Historique personnel et lecture administrative sous RLS ; enregistrement validé côté serveur. |

Les vues publiques de classement et les vues administratives sont une surface
API distincte, protégée par `security_invoker` et le contrat existant de
`npm run db:security`. Les tables de projection de `private` ne sont pas des
endpoints Data API ; certaines colonnes restent lisibles pour faire fonctionner
les vues `security_invoker`. `private` ne signifie donc pas automatiquement
« aucun grant client ».

Référence : [sécuriser la Data API Supabase](https://supabase.com/docs/guides/api/securing-your-api).

## Décision sur le schéma private

Un déplacement vers `private` non exposé a été évalué pour chaque table interne :

| Table | Dépendances à traiter lors d’un déplacement | Décision du Sprint F |
| --- | --- | --- |
| `daily_challenge_rulesets` | RPC `get_daily_challenge`, helpers Daily, déclencheurs de démarrage et de résultat, FK des tentatives et résultats, types générés. Les corps SQL/PLpgSQL qualifient explicitement `public.daily_challenge_rulesets`. | Conserver `public` avec RLS et zéro grant client. Une migration atomique des fonctions et de leurs versions historiques doit précéder un changement de schéma. |
| `progression_commands` | `unlock_champion_enhancement` déclare une variable `%ROWTYPE` et effectue lecture, insertion et mise à jour avec le nom qualifié ; les migrations de quarantaine et les contrôles d’idempotence référencent ce journal. | Conserver la frontière actuelle ; déplacer la table seule casserait les achats idempotents à l’exécution. |
| `progression_enhancement_security_baselines` | Archive écrite par migration, sans RPC métier active ; types générés et procédures d’audit/restauration à adapter. Un déplacement est techniquement plus simple. | Conserver l’archive à son emplacement documenté : le gain de frontière supplémentaire ne justifie pas une migration isolée de l’audit historique dans ce sprint. La prochaine revue des exceptions réévalue ce choix. |

La décision conserve les révocations explicites déjà migrées et RLS sans policy.
Aucune policy permissive de confort n’est ajoutée. Les accès serveur restent :
`SELECT` pour `service_role` sur le catalogue Daily ; les droits existants de
maintenance sur les deux journaux internes. Les fonctions `SECURITY DEFINER`
gardent leur surface d’exécution bornée par
`config/security-definer-privileges.json`.

Un futur déplacement devra conserver les signatures des RPC exposées, remplacer
leurs références qualifiées, vérifier les privilèges de schéma **et** de table,
régénérer les types et rejouer achats/Daily/restauration sur une base vide et une
base contenant des données. Le schéma `private` doit rester absent des schémas
exposés PostgREST ; les grants nécessaires aux projections de classement ne
constituent pas une autorisation pour les tables internes déplacées.

## Preuves exécutables

`tests/serverOnlyTables.database.test.ts` est découvert automatiquement par
`npm run test:db`. `npm run db:validate` reconstruit la base locale puis lance ce
test avec les autres contrats. Il compare les 22 tables du catalogue réel au
manifeste, exige RLS partout et vérifie la classification des accès clients.
Pour chaque table interne, il vérifie aussi les ACL de table et de colonne,
les grants hérités des rôles `anon`/`authenticated`, `PUBLIC`, l’absence de policy
et la lecture autorisée du serveur.

Les preuves comportementales exécutent `SELECT`, `INSERT`, `UPDATE` et `DELETE`
avec les vrais rôles PostgreSQL dans des transactions annulées, puis des lectures
Data API avec une session anonyme, un compte authentifié et un compte promu
administrateur. Chaque refus doit être une erreur PostgreSQL `42501` ; une liste
vide ne suffit pas. Le test vérifie également que le catalogue Daily reste
accessible par sa RPC bornée et supprime son compte éphémère.

La preuve locale nécessite `SUPABASE_DB_URL` et les trois variables habituelles
de `test:db`. `DB_TEST_REQUIRED=1` interdit une exécution silencieusement ignorée
quand ces paramètres sont absents. La recette est locale ; son succès ne prouve
pas que les ACL de production n’ont jamais dérivé.

## Exceptions advisors INFO

`config/supabase-advisors.json` accepte uniquement les trois objets internes
listés ci-dessus pour `rls_enabled_no_policy`, avec leur justification et une
expiration au **31 octobre 2026**. Chaque exception fournit le schéma, le nom
exact de la table et la clé advisor correspondante. Les jokers, une clé globale,
un objet différent ou un niveau autre que `security/INFO` sont invalides.
`tests/supabaseAdvisorPolicy.test.mjs` confronte cette liste à l’inventaire ;
`npm run db:advisors` l’applique aux advisors de la base locale et le preflight
existant l’applique en lecture à la base liée.

Avant expiration, relire la décision `private`, réexécuter les tests de privilèges
et les advisors, puis justifier explicitement chaque éventuel renouvellement.
Une nouvelle table sans policy requiert sa propre classification et une preuve
d’absence de grants ; son ajout à la liste n’est jamais automatique.
