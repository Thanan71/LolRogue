# Administration sécurisée

Le panneau `/admin` présente les statistiques, joueurs, runs et logs. La garde
React améliore l'expérience, mais l'autorisation réelle est imposée par PostgreSQL
avec RLS et `is_current_user_admin()`.

## Promouvoir un administrateur

Une promotion ne doit jamais être faite depuis le client ni avec la clé anonyme.
Elle nécessite un opérateur ayant accès au SQL Editor Supabase ou une connexion
PostgreSQL privilégiée.

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
- Le chargement initial attend statistiques, joueurs, logs et runs. Une erreur laisse
  les anciennes données identifiées comme telles et expose une action de retry ; une
  erreur de détail d'équipe invalide la lecture complète des runs.
- Le rang personnel provient exclusivement de `get_my_leaderboard_rank()` : le client
  ne télécharge jamais le leaderboard complet pour le recalculer.
- Les migrations de durcissement doivent être appliquées avant d'activer le
  panneau sur un ancien projet Supabase.

Pour tester, utiliser deux comptes distincts sur une base locale : le premier
promu par SQL doit accéder aux données admin; le second doit être refusé même s'il
modifie son état React ou appelle directement l'API REST.

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
