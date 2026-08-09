# Mesure des index de base de données

Dernière mesure : **9 août 2026**, sur Supabase local après `db:reset`.

Cette note rattache chaque index de `P2-DB-01` à une requête ou à une opération
référentielle réelle. Elle suit les recommandations Supabase : lire le plan avec
`EXPLAIN (ANALYZE, BUFFERS)`, préférer les index adaptés aux filtres réels et ne pas
sur-indexer les colonnes peu utilisées.

Références :

- [Query Optimization](https://supabase.com/docs/guides/database/query-optimization)
- [Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors?lint=0001_unindexed_foreign_keys)
- [Managing Indexes in Postgres](https://supabase.com/docs/guides/database/postgres/indexes)

## Inventaire des requêtes et décisions

| FK signalée | Usage réel observé | Décision |
| --- | --- | --- |
| `daily_challenge_rulesets.gameplay_ruleset_version` | lookup du ruleset par PK ou `is_active`; jointure depuis le ruleset vers le catalogue | pas d'index enfant : catalogue de versions append-only |
| `daily_runs.daily_ruleset_version` | affichage leaderboard filtré d'abord par date et état publié | pas d'index FK dédié : `idx_daily_runs_date_score` couvre le filtre dominant |
| `daily_runs.gameplay_ruleset_version` | partition secondaire du leaderboard après le filtre par date | pas d'index FK dédié : catalogue de versions append-only |
| `daily_runs.invalidated_by` | `ON DELETE SET NULL` lors de la suppression d'un compte admin | index partiel sur les valeurs non nulles |
| `daily_score_invalidation_audit.actor_user_id` | anonymisation `ON DELETE SET NULL` d'un opérateur supprimé | index partiel sur les valeurs non nulles |
| `daily_score_reports.reporter_user_id` | purge `ON DELETE CASCADE` des signalements du compte supprimé | index simple, car le reporter est la seconde colonne de l'unicité existante |
| `daily_score_reports.reviewed_by` | anonymisation `ON DELETE SET NULL` d'un opérateur supprimé | index partiel sur les valeurs non nulles |
| `logs.player_id` | anonymisation `ON DELETE SET NULL` lors de la suppression d'un profil | index partiel sur les valeurs non nulles |
| `progression_commands.ruleset_version` | idempotence par `(user_id, command_id)`; aucune recherche enfant par version | pas d'index : rulesets append-only |
| `run_attempts.daily_ruleset_version` | lifecycle par tentative, utilisateur, statut ou date Daily | pas d'index FK dédié : rulesets append-only |
| `run_attempts.gameplay_ruleset_version` | agrégation opérationnelle, sans filtre sélectif sur la version seule | pas d'index FK dédié : coût d'écriture sur une table chaude évité |
| `run_attempts.ruleset_version` | agrégation opérationnelle, sans filtre sélectif sur la version seule | pas d'index FK dédié : coût d'écriture sur une table chaude évité |

## Requêtes applicatives retenues

Deux index partiels supplémentaires suivent les filtres réels plutôt qu'une FK :

- l'administration lit les signalements `status = 'open'` par `created_at ASC`,
  limités à 100 ;
- la rétention supprime les signalements `dismissed`/`actioned` dont `reviewed_at`
  dépasse 24 mois.

Le leaderboard conserve son index `(daily_date DESC, score DESC)`, et les logs
conservent `(created_at DESC, level)`. Aucun nouvel index ne duplique ces chemins.

## Protocole reproductible

La commande locale `npm run db:indexes:measure` :

1. charge un volume synthétique dans une transaction annulée à la fin ;
2. mesure les plans avant puis après les index avec
   `EXPLAIN (ANALYZE, BUFFERS)` ;
3. mesure le coût d'insertion et la taille de chaque index ;
4. ne possède aucun mode `--linked` et ne modifie jamais la base distante.

Les résultats chiffrés sont actualisés après application des migrations, puis les
advisors locaux sont rejoués pour confirmer uniquement les couvertures choisies.
