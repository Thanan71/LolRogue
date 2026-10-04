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
