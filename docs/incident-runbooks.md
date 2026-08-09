# Runbooks d'incident

Ce document est exécutable par l'opérateur d'astreinte. Il ne contient aucun
secret ni identifiant de projet. Les références exactes, responsables et canaux
de contact sont renseignés dans la fiche de release privée avant promotion.

## Cadre commun

### Sévérité et objectifs

| Niveau | Exemple | Prise en charge | Mise à jour |
| --- | --- | --- | --- |
| SEV-1 | perte/corruption de données, fuite de secret, progression frauduleuse globale | 15 min | toutes les 30 min |
| SEV-2 | Supabase indisponible, vérification de runs ou Auth largement bloquée | 30 min | toutes les 60 min |
| SEV-3 | fonction dégradée avec contournement, incident individuel | 1 jour ouvré | à chaque changement d'état |

Le rôle Incident Commander décide, le rôle Opérateur exécute, et le rôle
Communication publie les mises à jour. Une même personne peut cumuler les rôles,
mais chaque décision destructive exige une seconde validation.

### Ouverture

1. Ouvrir un journal horodaté en UTC avec environnement, commit Vercel, projet
   Supabase, déclarant, symptômes et première heure connue.
2. Classer la sévérité et figer les changements non liés.
3. Conserver les identifiants techniques utiles (`runId`, `attemptId`, heure), sans
   copier token, email, trace complète ou état de jeu dans un canal public.
4. Vérifier les pages d'état Vercel/Supabase, les déploiements, logs Edge Function,
   erreurs PostgreSQL et métriques disponibles.
5. Choisir une procédure ci-dessous. Ne jamais lancer `supabase db reset` sur un
   projet hébergé.

### Clôture

Le service n'est rétabli qu'après smoke test, absence de nouvelle erreur pendant
30 minutes et validation de l'Incident Commander. Sous cinq jours ouvrés, écrire
impact, chronologie, cause racine, détection, résolution et action préventive, sans
donnée personnelle.

## Migration échouée

1. Arrêter toute nouvelle promotion frontend et noter la dernière migration
   visible dans Supabase.
2. Déterminer si la transaction SQL a échoué entièrement ou si une opération hors
   transaction a laissé un état partiel. Comparer l'historique distant aux fichiers
   versionnés avec `npx supabase migration list --linked`.
3. Si le schéma courant reste compatible, corriger par une **nouvelle** migration,
   la valider localement avec `npm run db:validate`, puis appliquer cette migration.
4. Si le schéma est incompatible avec le frontend courant, remettre immédiatement
   en service le dernier déploiement Vercel compatible. Ne pas modifier un fichier
   de migration déjà appliqué et ne pas réactiver un RPC retiré.
5. Si des données sont altérées, basculer vers le runbook de restauration et
   suspendre les nouveaux départs jusqu'à validation.

## Rollback applicatif

Le rollback Vercel est autorisé seulement si l'ancien build comprend le schéma
actuel. Depuis Deployments, sélectionner le dernier déploiement de production
connu comme sain puis **Instant Rollback**. Vérifier ensuite les variables : un
rollback instantané réutilise la configuration du build historique et ne reconstruit
pas les variables modifiées depuis.

Critères : rollback si Auth, démarrage, reprise ou finalisation d'une run échoue au
smoke test, si le taux d'erreur critique augmente durablement, ou si une migration
et son client ne peuvent être rendus compatibles en 30 minutes. Après rollback,
rejouer le smoke test de `docs/release-and-support.md` et empêcher l'auto-promotion
jusqu'à correction.

## Indisponibilité Supabase

1. Confirmer l'incident depuis deux réseaux et la page d'état Supabase ; distinguer
   Auth, Data API, PostgreSQL et Edge Functions.
2. Ne pas demander aux joueurs d'effacer le stockage local : les fins de run en
   attente sont retryables et doivent conserver attempt et journal.
3. Ne pas redéployer en boucle. Si l'origine est une configuration, restaurer les
   variables connues comme saines et redéployer ; si elle est fournisseur, suivre
   l'incident et communiquer la dégradation.
4. Après reprise, vérifier Auth, `get_daily_challenge`, démarrage/finalisation d'une
   run de test et backlog de vérification. Rejouer les vérifications retryables ;
   ne jamais attribuer manuellement les récompenses sans preuve autoritaire.

## Classement compromis

1. Capturer la version de score, la plage temporelle et les `run_attempts` associés.
2. Ne jamais corriger une ligne publique isolée directement. Désactiver la
   publication concernée par une nouvelle migration/RPC d'administration auditable
   ou retirer temporairement le leaderboard du client.
3. Vérifier la run autoritaire, le `content_hash`, les commandes et l'unicité du
   daily. Les runs rejetées ne doivent produire ni progression ni classement.
4. Corriger le vérificateur par une nouvelle version immuable, reconstruire avec
   `npm run edge:bundle`, déployer la fonction, puis activer le nouveau ruleset.
5. Recalculer uniquement depuis les données autoritaires conservées. Documenter
   toute invalidation et prévenir les joueurs si leur rang visible change.

## Rejets authority anormaux

1. Ouvrir `/admin`, onglet **Authority**, confirmer la fenêtre de 15 minutes, la
   version moteur/ruleset et le code déclencheur. Vérifier aussi si une attempt
   reste `finished` depuis plus de 5 minutes.
2. Copier uniquement `attemptId`, version, code, horodatage et compteurs agrégés
   dans le canal d'incident. Ne jamais y copier commandes, payload, journal,
   identité, équipe ou état joueur.
3. Classer SEV-2 si la vérification est largement bloquée ou si un code inconnu
   affecte plusieurs joueurs ; sinon SEV-3. Figer l'activation de toute nouvelle
   ruleset pendant le diagnostic.
4. Comparer le premier rejet au dernier déploiement frontend, Edge et migration.
   Reproduire avec une attempt de test sur la même version sans modifier la trace
   rejetée en production.
5. Corriger par une nouvelle version authority immuable. Une trace rejetée ne doit
   recevoir ni progression ni récompense manuelle. Clore seulement après retour
   sous les seuils pendant 30 minutes et contrôle du SLO 30 jours.

## Secret exposé

1. SEV-1 immédiat : retirer la valeur du fournisseur et des variables, puis la
   révoquer/faire tourner avant toute recherche de fuite.
2. Pour une clé Supabase publique anon, vérifier d'abord que RLS reste la frontière
   réelle ; pour service-role, token CLI, mot de passe DB ou compte opérateur,
   considérer toutes les données accessibles comme exposées jusqu'à preuve inverse.
3. Mettre à jour séparément Development, Preview et Production, redéployer les
   consommateurs et invalider les sessions concernées.
4. Examiner Git, artefacts CI, logs, captures et historique de déploiement. Ne pas
   recopier le secret dans le ticket d'incident.
5. Tester Auth/RLS et les fonctions après rotation, puis consigner l'heure de
   révocation et l'étendue de l'analyse.

## Sauvegarde absente ou restauration échouée

Suspendre toute mutation non essentielle, préserver le dump et ses sommes de
contrôle, puis suivre `docs/backup-and-restore.md`. Ne jamais écraser la production
avec un dump non restauré et validé sur un projet isolé. Si aucun point conforme au
RPO n'existe, déclarer SEV-1, quantifier la fenêtre de perte et contacter le support
Supabase avant toute nouvelle écriture.
