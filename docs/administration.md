# Administration sécurisée

Le panneau `/admin` présente les statistiques, joueurs, runs et logs. La garde
React améliore l'expérience, mais l'autorisation réelle est imposée par PostgreSQL
avec RLS et `is_current_user_admin()`.

L'application 0.2.11 expose quinze indicateurs avec leur définition FR/EN et des
totaux serveur distincts des lignes affichées. Le [contrat des métriques](admin-metrics.md)
précise les connexions du jour UTC, le registre Candies, les valeurs inconnues,
les droits et les limites des exports. La migration
`20261017042727_admin_metrics_candy_ledger.sql` est nécessaire pour ces nouvelles
données ; avant son application, les clés absentes et les anciens « gains »
calculés depuis les soldes s'affichent comme indisponibles.

Les [fiches joueurs et l’explorateur de runs](admin-explorer.md) ajoutent recherche,
pagination serveur, détails sûrs et export filtré borné à 5 000 lignes. Ils
nécessitent aussi la migration `20261017055016_admin_player_run_explorer.sql`.
Les [analytics temporels](admin-analytics.md) ajoutent trois lectures agrégées
indépendantes : courbes UTC, rétention exacte D1/D7/D30 et funnel de sept jours.
Les populations de règles restent séparées ; couverture, maturité, N et Wilson
sont explicites. Ils nécessitent la migration
`20261017070341_admin_temporal_analytics.sql`, dont le marqueur d’observation
n’est pas rétrodaté. Les invités, appareils et connexions historiques ne sont pas
mesurés. Un refus de permission purge les trois panneaux analytics.

Les déploiements distants restent des opérations séparées de la livraison code.

L’[espace Équilibrage](admin-balance.md) sépare les picks initiaux de toutes les
tentatives et les performances finales des runs vérifiées. Les contextes de
composition et de règles, effectifs, incertitudes et données manquantes sont
explicites. Il réutilise la calibration existante et lit les versions/flags sans
action de mutation. Il nécessite la migration
`20261018073001_admin_balance_workspace.sql`. ADM-20 reste en attente de TREE-10 ;
son panneau ne reconstruit aucune métrique d’arbre depuis les soldes Candies.

## Promouvoir un administrateur

Une promotion ne doit jamais être faite depuis le client, une RPC générique ou la
clé anonyme, et jamais depuis les métadonnées Auth. Elle nécessite un opérateur
ayant accès au SQL Editor Supabase ou une connexion PostgreSQL privilégiée. Le dépôt maintient
explicitement `REVOKE UPDATE (is_admin)` pour les rôles web ; `handle_new_user`
ignore également tout champ `is_admin` ou `role` fourni lors de l'inscription.

1. Faire confirmer l'adresse ou l'identifiant exact du compte à promouvoir.
2. Retrouver son UUID dans Authentication → Users.
3. Vérifier la cible avant toute écriture :

```sql
SELECT
  u.id,
  u.email,
  p.username,
  p.display_name,
  p.is_admin
FROM auth.users AS u
JOIN public.players AS p ON p.user_id = u.id
WHERE u.id = 'USER_UUID';
```

4. Exécuter la promotion dans une transaction qui échoue si la cible n'existe
   pas :

```sql
BEGIN;

DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE public.players
  SET is_admin = TRUE
  WHERE user_id = 'USER_UUID'
    AND is_admin = FALSE;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'Promotion annulée : cible absente ou déjà administrateur';
  END IF;
END
$$;

COMMIT;
```

5. Rejouer le `SELECT`, demander une reconnexion et vérifier `/admin`.
6. Consigner qui a autorisé et exécuté la promotion dans le journal
   d'exploitation externe.

Ne jamais placer une clé service-role dans une variable `VITE_*`, une console
navigateur, une issue ou une capture d'écran.

## Révoquer un administrateur

Vérifier d'abord qu'un autre administrateur opérationnel subsiste, puis exécuter :

```sql
BEGIN;

UPDATE public.players
SET is_admin = FALSE
WHERE user_id = 'USER_UUID'
  AND is_admin = TRUE;

COMMIT;
```

Rejouer la requête de vérification et invalider la session concernée si la
révocation est urgente.

## Modèle de sécurité

- `authenticated` ne possède pas le droit de mettre à jour `players.is_admin`.
- `is_current_user_admin()` est exécutable par `authenticated`, car les politiques
  RLS et vues admin en droits appelant en dépendent, mais jamais par `anon`.
- Les vues `admin_stats` et `admin_player_stats` s'exécutent avec les permissions
  de l'appelant et filtrent par la fonction admin.
- Les politiques des runs, joueurs, maîtrises et logs n'accordent la lecture
  globale qu'aux admins.
- Les clients n'insèrent jamais directement dans `logs`; la RPC attribue chaque
  ligne à la session. Les diagnostics expirent après 14 jours et disparaissent
  immédiatement avec le compte concerné.
- Les exports CSV sont produits après une lecture déjà autorisée par la base. Chaque
  cellule est échappée et les préfixes de formule `=`, `+`, `-`, `@`, y compris après
  des espaces, sont forcés en texte avant le téléchargement.
- Chaque ressource admin expose chargement, erreur et retry indépendamment.
  L’espace de modération est chargé à la demande. Une erreur de relecture garde
  les anciennes données identifiées comme périmées et interdit les décisions.
- Le rang personnel provient exclusivement de `get_my_leaderboard_rank()` : le client
  ne télécharge jamais le leaderboard complet pour le recalculer.
- Les migrations de durcissement doivent être appliquées avant d'activer le
  panneau sur un ancien projet Supabase.

Le manifest `config/security-definer-privileges.json` constitue la liste exhaustive
des fonctions privilégiées directement exécutables par `anon`, `authenticated` ou
`service_role`. `npm run database -- security` compare les ACL réelles à ce manifest et
refuse tout grant supplémentaire, tout grant `PUBLIC` ou tout `search_path` non
vide. À ce jour, aucun warning Supabase relatif aux fonctions privilégiées n'est
accepté globalement : toute nouvelle alerte est bloquante jusqu'à ajout d'une
justification précise au manifest et d'un test associé.

## Invalidation auditée d'un score Daily

Le [contrat de modération](admin-moderation.md) décrit la file complète, les filtres
UTC, les trois statuts et l’historique paginé. Il nécessite la migration
`20261018082740_admin_audited_moderation.sql`. Le navigateur utilise uniquement
`admin_moderation_queue`, `admin_moderation_history` et
`admin_moderation_decide`, qui délèguent à un contrôle admin réel en base.

Une décision confirme UUID, date, portée et justification avant envoi. Invalider
exclut uniquement le score Daily et traite ses signalements ouverts ; rejeter
ne ferme que le dossier sélectionné. La run autoritaire et son résultat restent
intacts. Une clé lie la commande admise à son acteur et à son contenu exact afin
qu’un double clic ou un réessai ne répète pas l’effet.

`private.moderation_events` est le journal canonique. L’ancien journal
`daily_score_invalidation_audit` est importé puis archivé, sans nouvelle double
écriture. Ses lectures directes, celles des signalements, leurs insertions et
l’ancien RPC `invalidate_daily_score` sont révoqués pour le navigateur. Les
helpers et le journal n’ont aucun droit d’écriture API. Les traces expirent
selon leur type, avec purge quotidienne ; suppression de compte et anonymisation
des acteurs restent prises en charge.

La [preuve locale](admin-s5-validation-2026-10-18.md) inclut une vraie session
navigateur, les RPC/PostgreSQL et le refus d’une décision après retrait du rôle
avec le même JWT. Un refus de lecture `42501` ou un reçu d’action
`admin_access_denied` purge toutes les ressources de modération. L’audit des
refus d’action authentifiés est conservé par un reçu structuré, sans exception
qui annulerait simultanément sa trace.

## Intervention courante

Avant une action sur les données :

1. identifier précisément le projet Supabase et l'environnement ;
2. sauvegarder ou vérifier le point de restauration ;
3. faire une lecture ciblée de la ligne ;
4. utiliser une transaction et une clause `WHERE` sur UUID ;
5. contrôler le nombre de lignes modifiées ;
6. vérifier le résultat et consigner l'intervention.

Les statistiques et logs servent au diagnostic. Ils ne justifient pas de modifier
manuellement un résultat de partie sans décision explicite et traçable.
