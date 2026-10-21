# Diagnostics administrateur

ADM-27 à ADM-31 ajoutent des lectures techniques à l’application **0.2.12**.
La migration `20261018100541_admin_technical_diagnostics.sql` doit être appliquée
avant le client correspondant. Le schéma, les preuves locales, la fusion et les
opérations distantes restent des étapes distinctes.

## Sources et accès

Les onglets Logs et Authority partagent un espace chargé à la demande. Le
navigateur appelle uniquement `admin_diagnostics` ; il ne lit plus directement
`logs`, `authority_attempt_aggregates` ou `authority_recent_rejections`.
Les anciennes vues agrégées restent disponibles pour les clients compatibles
et les procédures opérateur. La table `logs` est réservée aux accès serveur.

La façade publique est `SECURITY INVOKER`. Le definer privé vérifie `auth.uid()`,
le profil administrateur actuel et une identité Auth non anonyme avant de lire
les filtres ou une cible. Ni les métadonnées utilisateur ni un ancien claim
administrateur ne donnent accès. Une révocation prend effet à la lecture
suivante, même avec le même JWT. Un refus `42501` purge toutes les ressources
du diagnostic dans l’interface, y compris les réponses tardives.

Les fonctions utilisent un `search_path` vide et des droits nommés ; aucun rôle
supérieur `dev` ni clé privilégiée n’est ajouté au navigateur. Les clés de service
restent réservées aux opérations Node et aux procédures opérateur existantes.

## Contrat de lecture

`admin_diagnostics(p_section, p_filters, p_cursor, p_snapshot, p_limit)` renvoie
une enveloppe versionnée : `schemaVersion: 1`, section, filtres normalisés,
`snapshotAt` et données minimales. Le client valide l’entrée et la réponse sans
convertir silencieusement les types ou conserver de champs supplémentaires.

| Section | Filtres serveur | Résultat |
| --- | --- | --- |
| `logs` | dates, niveau, opération, UUID de session diagnostic et tentative | page, total filtré, curseur et rétention |
| `authority` | dates de départ, moteur, gameplay, statut et code | page de tentatives, décomptes et fenêtre d’alertes indépendante |
| `service` | dates, moteur, gameplay, heure/jour | tranches UTC, résumé mesuré et backlog |
| `correlation` | dates et UUID exact de tentative | métadonnées serveur et page de logs explicitement liés |

Les dates sont des jours UTC : début inclus, lendemain de fin exclu. La période
maximale est de 31 jours, celle par défaut de 7 jours. Les pages sont de 25 lignes
par défaut, 50 au maximum, dans l’ordre décroissant `(date, UUID)`. Le total est
calculé avant la limite. Un curseur conserve les six décimales PostgreSQL et
nécessite un snapshot. Le client conserve snapshot et filtres pendant la pagination
et repart de la première page si un filtre change. Les lectures bornent les créations à
`snapshotAt` ; elles ne reconstruisent pas un historique des changements de statut.

Les filtres statut/code concernent la liste des tentatives. Les indicateurs de
service utilisent la période et les versions ; les alertes utilisent leur propre
fenêtre courte et les versions. Ces périmètres sont indiqués dans le formulaire.

## Journaux facultatifs et corrélations

`VITE_ENABLE_DB_LOGGING=true` reste un opt-in de build, désactivé par défaut.
Cette valeur décrit le build courant, pas la configuration de tous les clients.
Un build sans envoi peut consulter des logs conservés provenant d’autres clients.
Une file vide ne démontre ni l’absence d’erreurs ni une disponibilité de 100 %.

Le transport existant `submit_client_logs` conserve ses quotas et son assainissement.
Le navigateur ne choisit jamais l’identité propriétaire de la ligne. Un batch
est lié à la session vérifiée avant son envoi et est annulé lors d’un changement
d’identité. Buffer, historique, compteurs locaux et corrélation sont effacés à
cette frontière, y compris A → B → A ; un refresh du token du même compte les
conserve. Une réponse tardive ne réintroduit pas le buffer précédent.

`session_id` est l’UUID éphémère de diagnostic, pas un token Auth. Les événements
peuvent porter un `attemptId` UUID, distinct du `runId` local. Un démarrage ne
reçoit ce lien qu’après la réponse serveur ; une tentative inexistante ou un lien
vers un autre propriétaire ne devient pas une corrélation valide. Les identifiants
de commande ne donnent accès à aucun contenu de commande.

La projection expose seulement des labels techniques reconnus, les dates, le
niveau, l’opération, une durée bornée et les identifiants de corrélation utiles.
Un label non reconnu devient `unknown`. Les textes libres d’erreur hérités sont
masqués ; aucun détail JSON brut, stack, JWT, adresse IP, email, commande, seed,
équipe ou identité de joueur n’est renvoyé. Aucun export brut n’est ajouté.

La lecture exclut les logs de plus de **14 jours**, même si la purge n’a pas encore
tourné et même avec un snapshot ancien. Le job de purge existant continue de
supprimer physiquement les données ; aucune nouvelle collecte ou rétention n’est
activée. `linksComplete: false` indique que les événements facultatifs ne sont
jamais une preuve d’exhaustivité.

## Indicateurs de service

Les sources sont les tentatives serveur déjà conservées. Les compteurs de départ,
vérification, rejet, expiration et attente portent sur les départs de la période.
Les seals constituent une cohorte indépendante : un départ antérieur dont le seal
entre dans la période reste éligible.

Le SLI seal → terminal compte les seals ayant atteint `verified` ou `rejected`
sous **120 secondes**, parmi tous les seals dont ce délai est écoulé. Une
expiration, une attente persistante ou une réponse terminale tardive ne devient
pas un succès. Le p95 utilise les durées terminales effectivement observées ;
il ne mesure ni une durée HTTP ni la durée totale de jeu. Le backlog couvre les
tentatives scellées depuis plus de **5 minutes** encore en attente, même hors de
la période choisie. La cible de référence reste **99 %** ; la fenêtre affichée
est celle sélectionnée et ne prétend pas être automatiquement un SLO sur 30 jours.

Chaque tranche heure/jour existe, même vide, jusqu’à 744 tranches horaires. Une
tranche vide est sans signal. Sans seal éligible, le SLI reste indisponible. Sans durée terminale observée, le
p95 reste indisponible ; un seal récent déjà terminé peut contribuer à ce p95
avant de devenir éligible au SLI.
Les taux d’erreur des requêtes, la disponibilité HTTP et leur latence p95 restent
**non instrumentés** : les compteurs navigateur sont locaux à l’onglet et ne sont
pas transformés en télémétrie globale. Voir [observabilité](observability.md) et
le rapport opérateur indépendant `scripts/sql/technical-slo.sql`.

## Alertes et incidents

Le diagnostic réutilise `AUTHORITY_REJECTION_ALERT_POLICY` : code inconnu,
trois rejets du même code, ou au moins 20 % de rejets dès cinq tentatives. La
fenêtre contient les quinze minutes UTC closes précédentes ; la minute en cours
est exclue. Les versions moteur/gameplay restent séparées. Une limite d’agrégats
est signalée comme couverture incomplète et ne donne pas un faux retour normal.

Le suivi est en mémoire pour la session admin. Une même observation ne répète pas
l’alerte ; une cause différente ou une escalade est mise à jour. Un échec réseau,
un échantillon insuffisant, une fenêtre vide ou tronquée ne prouve pas un
rétablissement. Un changement de périmètre de versions réinitialise la comparaison.
Les incidents actifs restent visibles ; seul l’historique local des résolutions
est borné. Aucune notification ni surveillance en temps réel n’est promise.

Un rejet ne démontre pas une triche. L’interface distingue les erreurs techniques,
les rejets du contrat, les codes non classés et les codes absents, puis renvoie au
[runbook authority](incident-runbooks.md#rejets-authority-anormaux). La décision
et la clôture d’un incident suivent le runbook opérateur, sans mutation depuis
cet espace de lecture.

## Validation et retour arrière

Les [preuves ADM-S6](admin-s6-validation-2026-10-18.md) séparent les tests purs,
les contrôles SQL/RLS réels, le navigateur connecté et la CI du SHA livré.
Les fixtures de test ne prétendent pas être des replays du moteur.

La révocation de la lecture directe des logs rend l’ancien panneau admin
incompatible. Le candidat de rollback doit donc inclure le nouveau client RPC,
son interface et la migration 73 ; le checkpoint ancien ne peut plus être déclaré
compatible uniquement parce que les flux de jeu fonctionnent. Le candidat retenu
dans `config/application-rollback.json` est testé localement, et reste distinct
d’un déploiement de production connu comme sain.
