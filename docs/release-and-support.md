# Release, environnements et support

## Séparation des environnements

| Environnement | Vercel | Supabase | Données | Administration |
| --- | --- | --- | --- | --- |
| Development | local uniquement | stack locale CLI | synthétiques, réinitialisables | promotion SQL locale |
| Preview | déploiement de branche | projet Supabase preview dédié | synthétiques uniquement | comptes de test séparés |
| Production | branche `main`, domaine public | projet Supabase production dédié | joueurs réels | accès nominatif minimal |

Aucune preview ne cible la production. Les deux variables `VITE_PUBLIC_*` sont
affectées séparément dans Vercel ; service-role, mot de passe DB et token CLI ne
sont jamais des variables `VITE_*`. La fiche privée des environnements contient les
project refs, domaines, région, propriétaires et date de dernière revue, mais aucun
secret. Avant toute commande liée, afficher le projet distant et le comparer à la
fiche ; une commande destructive exige confirmation par une seconde personne.

## Rotation et droits

- Rotation planifiée annuelle des mots de passe DB/tokens opérateur, immédiate au
  départ d'un opérateur ou soupçon d'exposition.
- Après rotation : mettre à jour le gestionnaire de secrets, CI et environnement
  concerné, redéployer, invalider l'ancien secret, puis tester.
- Les clés anon sont publiques par conception mais restent séparées par projet ; la
  sécurité repose sur RLS. Une clé service-role ne passe jamais par le navigateur.
- Les promotions/révocations admin suivent `docs/administration.md`, sont nominatives,
  datées et revues chaque trimestre. Aucun compte partagé.

## Checklist de release

La personne qui publie copie cette liste dans la fiche de release avec commit,
versions de migration/ruleset, déploiements, opérateur rollback et heure UTC.

### Avant promotion

- [ ] Branche à jour, CI verte, diff sans secret et dépendances auditées.
- [ ] `npm ci`, `npm run check`, `npm run test:e2e`, `npm run test:e2e:production`,
      `npm run db:validate` et `npm run test:db` réussissent sous Node 24.
- [ ] Migrations nouvelles uniquement, types DB à jour et fonction autoritaire
      bundlée ; sauvegarde récente et exercice de restauration trimestriel valides.
- [ ] Variables Preview pointent vers Preview ; smoke test Preview réussi.
- [ ] Rollback compatible identifié. Si le schéma n'est pas rétrocompatible, le
      plan de correction avant migration est écrit et les nouveaux départs peuvent
      être suspendus.

### Ordre de promotion

1. Déployer la fonction compatible (`npm run edge:deploy`).
2. Pour une nouvelle version comprise par le client, publier le frontend sans
   activer encore la ruleset.
3. Appliquer les migrations (`npm run migrate`) sur le projet confirmé.
4. Promouvoir le déploiement Vercel validé et noter son URL/commit.
5. Exécuter le smoke test. En cas d'échec critique, appliquer immédiatement les
   critères de rollback de `docs/incident-runbooks.md`.

### Smoke test production

- [ ] `/auth`, `/menu`, `/run` et une route profonde répondent sans 404/CSP/asset.
- [ ] Auth et invité fonctionnent ; un non-admin est refusé sur `/admin`.
- [ ] Une run connectée démarre, reprend après reload et finit avec statut `verified`.
- [ ] Le retry de vérification ne double ni run, candies, maîtrise ni classement.
- [ ] Une trace impossible devient `rejected` sans progression.
- [ ] Daily seed/ruleset sont cohérents et une seule soumission apparaît.
- [ ] Profil, améliorations et rang personnel chargent ; console/réseau sont propres.
- [ ] Logs Vercel, Supabase et Edge Function restent stables pendant 30 minutes.

## Support utilisateur

Le canal de support public doit être affiché dans les mentions du produit avant la
bêta. Chaque demande reçoit un identifiant, une date UTC, une catégorie et un état.
Ne jamais demander mot de passe, token, dump du stockage navigateur ou capture
contenant une clé. Pour diagnostiquer une run : demander heure approximative,
pseudonyme et identifiant technique visible ; retrouver côté admin sans exposer
d'autres comptes.

### Export de compte

1. Authentifier le demandeur via sa session ou une procédure hors bande approuvée.
2. Geler l'export à un instant UTC et extraire uniquement les données reliées à son
   `auth.users.id` : profil, maîtrise, améliorations, runs, tentatives/commandes et
   participations daily. Exclure secrets internes et données d'autres joueurs.
3. Produire JSON/CSV UTF-8, vérifier manuellement l'identité des lignes, chiffrer le
   fichier et transmettre le secret par un canal distinct.
4. Supprimer l'archive de travail après confirmation et consigner seulement preuve,
   périmètre et date. Tant qu'aucun export self-service n'existe, cette opération est
   réservée à un opérateur privilégié et ne doit pas être exécutée via `/admin`.

### Suppression de compte

1. Authentifier et confirmer explicitement le caractère irréversible ; suspendre si
   une obligation de conservation documentée s'applique.
2. Proposer l'export avant suppression et identifier l'UUID exact deux fois.
3. Dans une transaction privilégiée, supprimer d'abord les `daily_runs` du joueur :
   leurs références `ON DELETE RESTRICT` vers runs/attempts empêchent une confiance
   aveugle dans la cascade. Supprimer ensuite l'utilisateur depuis Supabase
   Authentication. Les autres données possédées suivent les cascades ; les logs
   dont l'identité est nullable sont anonymisés par `SET NULL`.
4. Vérifier l'absence dans `auth.users`, `players`, maîtrise, améliorations, runs et
   attempts, invalider les sessions puis demander au joueur d'effacer son état local.
5. Consigner demande, validations, opérateur et résultat sans conserver les données
   supprimées. Ne jamais supprimer directement `players` en laissant `auth.users`.

Une erreur individuelle sans risque global est SEV-3. Suspicion de fuite, suppression
du mauvais compte ou corruption bascule immédiatement sur le runbook SEV-1.
