# Administration sécurisée

Le panneau `/admin` présente les statistiques, joueurs, runs et logs. La garde
React améliore l'expérience, mais l'autorisation réelle est imposée par PostgreSQL
avec RLS et `is_current_user_admin()`.

L'application 0.2.13 expose quinze indicateurs avec leur définition FR/EN et des
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
`20261018073001_admin_balance_workspace.sql`. Depuis 0.3.0, le panneau
**Arbres et Candies** d’ADM-20 réutilise les reçus TREE-10 et le registre existant
pour les achats, resets, disponibilités et builds figés. Il requiert aussi les
migrations TREE jusqu’à `20261022164730` ; aucun agrégat n’est reconstruit depuis
les soldes. Voir le [contrat](admin-balance.md#arbres-candies-et-spécialisations--adm-20--tree-10)
et les [preuves ADM-20](admin-20-validation-0.3.0.md).

## Interface ADM-S7

L’[interface 0.2.13](admin-interface.md) organise les six groupes Vue globale,
Joueurs, Runs, Équilibrage, Modération et Surveillance. L’URL conserve les filtres
appliqués et les sélections indépendantes de joueur/run, sans JWT, curseur ou DTO.
Les rôles et les contrats de données ci-dessous restent les sources de vérité.
Les tables à colonnes essentielles et les parcours FR/EN/clavier/zoom ont des
[preuves automatisées locales](admin-s7-validation-2026-10-21.md) ; VoiceOver et
NVDA restent à vérifier humainement. S7 ne modifie ni SQL, ni permissions, ni
versions authority. La PR, la CI/Preview et le déploiement ont leurs gates propres.

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
- Les politiques des runs, joueurs et maîtrises n'accordent la lecture globale
  qu'aux admins. Les logs ne sont plus lisibles directement depuis le navigateur :
  `admin_diagnostics` vérifie le rôle courant et renvoie une projection minimale.
- Les clients n'insèrent jamais directement dans `logs`; la RPC attribue chaque
  ligne à la session. Les diagnostics expirent après 14 jours et disparaissent
  immédiatement avec le compte concerné.
- Les exports CSV sont produits après une lecture déjà autorisée par la base. Chaque
  cellule est échappée et les préfixes de formule `=`, `+`, `-`, `@`, y compris après
  des espaces, sont forcés en texte avant le téléchargement.
- Chaque ressource admin expose chargement, erreur et retry indépendamment.
  L’espace de modération est chargé à la demande. Une erreur de relecture garde
  les anciennes données identifiées comme périmées et interdit les décisions.
  Logs et Authority partagent aussi un espace chargé à la demande ; une lecture
  refusée efface toutes ses ressources et ses incidents locaux.
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

## Surveillance technique

Le [contrat ADM-S6](admin-diagnostics.md) couvre la pagination des journaux et
tentatives, les indicateurs de vérification, les corrélations et le suivi
d’incidents. Il requiert la migration `20261018100541` avant le client 0.2.12.
La fenêtre d’alertes correspond aux quinze minutes UTC closes précédentes ;
les filtres de la liste et ceux des indicateurs restent explicitement distincts.
L’absence de logs facultatifs ou d’échantillons serveur ne prouve pas une absence
de panne. Aucun envoi de diagnostics ni notification n’est activé implicitement.

Les labels exposés viennent d’un catalogue fermé ; les textes libres et les
données de jeu sont masqués. Les liens de tentative exigent le même propriétaire
que le log. Le retrait du rôle admin est testé avec une vraie session navigateur
et le même JWT dans les [preuves S6](admin-s6-validation-2026-10-18.md).

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
