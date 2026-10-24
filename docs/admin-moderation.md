# Modération Daily auditée

L’application **0.2.11** remplace l’ancien tableau limité à 100 signalements par
un espace chargé à la demande. La migration
`20261018082740_admin_audited_moderation.sql` est nécessaire. La livraison du code
ne prouve ni l’application de cette migration à distance, ni une décision réelle
en production.

## File et données

La source reste `daily_score_reports`, avec trois statuts visibles : `open`,
`resolved` et `dismissed`. `resolved` représente le statut historique `actioned`
en base. La file se parcourt du plus ancien au plus récent, avec un curseur exact
`(created_at, id)` et des pages de 25 lignes, bornées à 50 côté serveur. Aucun
dossier ouvert n’est exclu en raison de son âge.

Les dates facultatives filtrent **la création du signalement**, en jours UTC
inclusifs ; la date du défi est affichée séparément. Un UUID de score permet de
limiter la file à une cible exacte. Les totaux et les trois compteurs de statut
sont calculés sur le serveur avec ces mêmes filtres, avant pagination.

`snapshotAt` borne les créations incluses dans la pagination. Il ne fige pas les
statuts entre deux appels : une décision concurrente peut retirer un dossier de
la file ouverte. Une actualisation repart de la première page actuelle. Les
dates de revue héritées sont conservées même si un ancien RPC a rouvert le
signalement ; une date inconnue n’est pas reconstruite depuis `created_at`.

Chaque dossier expose son motif assaini, sa date, son statut, le nombre de
signalements du même score et les versions connues. Aucun identifiant du
déclarant, e-mail, jeton, lease ou journal autoritaire brut n’est projeté.
L’historique conservé utilise son propre curseur descendant `(occurred_at, id)`.
L’ancien journal d’invalidation est importé avec ses identifiants, acteurs et
dates historiques ; les motifs sont assainis et aucun identifiant de requête
rétroactif n’est inventé.

## Décider sans répéter une action

Le navigateur prépare une décision, affiche cible, date, justification, portée et
conséquences, puis exige de recopier l’UUID exact du score. Il génère une clé de
requête et fige le contenu confirmé avant l’envoi.

| Action             | Effet atomique                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalidate_score` | Exclut un score terminé et encore valide du classement Daily ; traite tous ses signalements ouverts ; écrit une seule décision dans le journal canonique |
| `dismiss_report`   | Rejette uniquement le signalement sélectionné ; laisse le score et les autres signalements dans leur état actuel                                         |

Le serveur vérifie le dossier encore ouvert, la cible et la date confirmées sous
verrou. Une invalidation ne réécrit aucune run, commande ou résultat autoritaire.
Le rejet d’un ancien signalement reste possible si le score a déjà été invalidé.
Aucune action de restauration ni modification de règles n’est ajoutée.

Les commandes admises lient la clé à l’acteur et à l’empreinte du contenu exact.
Deux appels concurrents ou un réessai retournent une seule décision et la même
référence d’audit ; une autre charge avec la même clé est refusée. Les rejets
d’accès et de quota sont agrégés par fenêtre pour empêcher le remplissage du
journal : ils ne créent aucun effet métier et ne constituent pas un reçu terminal
perpétuel. La même demande peut être admise après expiration d’une limite.

Un délai ou une réponse perdue produit un **résultat inconnu**, pas une invitation
à préparer une autre décision. L’interface verrouille cible et contenu et propose
de réessayer la même demande. Une réponse malformée suit cette même règle. La
demande est gardée en mémoire, sans justification dans le stockage navigateur.
Un rechargement complet relit l’état serveur ; le dossier déjà traité ne peut pas
recevoir une seconde décision. Les clés conservées suivent la rétention du
journal ; la protection métier sur le dossier et le score reste applicable.

## Contrat RPC et autorisations

| RPC publique invoker       | Paramètres                                                                          | Résultat                                 |
| -------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| `admin_moderation_queue`   | statut, limite, curseur, borne de création, dates UTC et UUID de score facultatifs  | File, totaux filtrés et prochain curseur |
| `admin_moderation_history` | UUID du score, limite, curseur et borne de création                                 | Événements minimaux conservés            |
| `admin_moderation_decide`  | clé de requête, dossier, UUID/date confirmés, action, motif et portée `daily_score` | Reçu appliqué, rejoué ou refusé          |

Les fonctions publiques délèguent à un definer privé à `search_path` vide. Les
lectures et les actions ont des entrées distinctes ; le rôle admin actuel dans
`players`, l’identité Auth réelle et son caractère non anonyme sont contrôlés en
base. Les métadonnées et les claims client ne confèrent aucun droit. Le verrou
d’identité ordonne une révocation concurrente avec une décision.

Un joueur ne lit aucun dossier. Un administrateur peut lire et décider ; il ne
peut ni se promouvoir ni modifier le journal. Le futur rôle `dev` reste hors de
ce chantier. Les anciens accès navigateur `invalidate_daily_score` et les
lectures/insertions directes des signalements sont révoqués : il n’existe pas un
second canal client contournant les contrôles. Le journal privé et ses compteurs
n’ont aucun grant API, y compris pour `service_role`.

Une lecture interdite échoue avec `42501`. Une action authentifiée refusée pour
droits insuffisants renvoie un reçu `admin_access_denied` afin de conserver son
audit, sans rechercher ni divulguer la cible. Le navigateur traite les deux
formes comme une révocation : file, historique, reçu et actions sont purgés,
y compris les réponses tardives. Les appels bloqués par une ACL ou par le typage
HTTP avant l’entrée dans la fonction ne créent pas un faux événement attribué.

## Limites, minimisation et suppression

- Modération : 10 nouvelles commandes par minute et 100 par jour UTC, par acteur.
  Un réessai exact d’une commande admise ne consomme pas une nouvelle place.
- Signalement joueur : 5 nouvelles tentatives par minute et 20 par jour UTC.
  Un doublon conserve le dossier, sa date et sa décision au lieu de le rouvrir.
- Les rejets applicatifs sont retournés sans lever une exception qui annulerait
  simultanément leurs compteurs et leur trace. Un signalement refusé reçoit un
  statut HTTP d’erreur ; aucune fausse réussite n’est présentée au joueur.
- Motifs : 10 à 500 caractères normalisés pour les décisions, assainissement
  serveur des secrets et données privées courantes. Les rejets n’enregistrent pas
  le motif brut. Aucun export de modération n’est introduit.

| Donnée                                  | Seuil de purge                                     |
| --------------------------------------- | -------------------------------------------------- |
| Dossier ouvert                          | Jusqu’à décision ou suppression du compte concerné |
| Signalement traité/rejeté               | 365 jours après sa revue                           |
| Décision et ancien audit d’invalidation | 365 jours après l’événement                        |
| Rejet, abus et fenêtres de limitation   | 30 jours                                           |

Le job existant `lolrogue-purge-expired-social-data` est replanifié quotidiennement
à 04:43 UTC ; aucun second job n’est créé. Les seuils entraînent une suppression
physique lors de la prochaine purge quotidienne. La fonction et les compteurs de
maintenance restent réservés aux opérateurs. La raison expirée sur le marqueur
d’exclusion Daily est remplacée par un libellé neutre ; le score reste exclu et
son résultat n’est pas réécrit. La suppression d’un compte efface les données
liées à sa participation et anonymise l’acteur dans les décisions conservées.

Ces durées décrivent le contrat technique du dépôt. La revue juridique déjà
requise pour la diffusion publique reste distincte. Les commandes de contrôle du
cron et des suppressions sont dans [le runbook](backup-and-restore.md).

## Vérifications

La [preuve de validation ADM-S5](admin-s5-validation-2026-10-18.md) distingue tests
locaux, CI, preview et état distant. Le parcours connecté utilise une vraie
inscription navigateur, les RPC de production, les parseurs de production et la
base locale jetable ; ses scores terminés sont des fixtures SQL explicites.
Les tests de base couvrent pagination au-delà de 100 dossiers, doublons, accès,
concurrence, rollback, audit, suppression, limites et conservation des résultats
historiques. Les tests navigateur couvrent aussi FR/EN, 320 px, clavier et axe.
