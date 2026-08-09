# Accès aux données

`src/types/database.ts` est généré par Supabase CLI depuis le schéma local appliqué.
`npm run db:validate` régénère, formate et refuse tout diff avant les tests DB. Les
modèles persistés de `types/models.ts` sont des alias `Tables`, `TablesInsert` ou
`TablesUpdate` et ne recopient plus le schéma manuellement. Tous les clients passés
aux repositories utilisent `SupabaseClient<Database>`.

`npm run test:db` découvre automatiquement tous les fichiers
`tests/**/*.database.test.ts`; ajouter une suite DB ne demande donc aucune liste à
maintenir. `repositoryIntegration.database.test.ts` instancie les repositories avec
de vrais clients anon/authenticated contre PostgREST local et exerce notamment le
nested select `runs_run_attempt_id_fkey`. `npm run db:migrations:check` compare les
migrations du dépôt au schéma local appliqué, tandis que
`npm run db:migrations:check:linked` effectue la même gate en lecture seule sur le
projet Supabase lié avant toute promotion.

Les stores et services métier passent par les repositories. Trois exceptions sont
volontaires : les RPC d'autorité dans `runAttemptService`, le démarrage daily dans
`DailyRunPage`/`StarterSelectPage`, et les lectures Admin composables. Elles appellent
des fonctions ou vues SQL typées, ne réimplémentent pas de modèle DB et gardent les
contrôles RLS côté serveur. `useAdminData` reste la composition root de ses filtres
jusqu'au chantier P2-SEC-01, qui doit également exposer erreurs et retries dans l'UI.

Le faux cache configurable et le singleton global du container ont été retirés. Une
composition root possède une instance explicite ; seul le lazy-loading interne des
repositories, réellement utilisé, est conservé.
