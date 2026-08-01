# Politique d'observabilité

Les diagnostics client sont désactivés par défaut. Leur envoi nécessite
`VITE_ENABLE_DB_LOGGING=true` et une session authentifiée. Aucun email, nom,
token, contenu de commande ou état de run n'est accepté. Seuls `runId` et
`commandId`, identifiants techniques nécessaires à la corrélation, sont permis.

Le navigateur conserve au maximum 200 événements en mémoire et limite chaque type
à 20 événements par minute. Le buffer d'envoi est limité à 100 entrées et deux
retries. La base applique ses propres quotas et nettoie les logs de plus de 14 jours.
L'accès est réservé aux administrateurs via RLS et les vues Admin.

Métriques couvertes : erreur front, échec de sauvegarde, retry, asset cassé, erreur
de réhydratation et durée/résultat des transitions. Les textes et détails sont
nettoyés par le même filtre que les logs DB avant toute conservation ou émission.
