# Validation ADM-S5 — 18 octobre 2026

Parent : `c11819544f0ec34ebfcf3454593a82a2f6bf49c1` (`dev`, PR #227 fusionnée).
Branche : `feat/adm-s5-audited-moderation`. Application **0.2.11**, patch notes
FR/EN publication **16**. PR destinée à `dev`, sans fusion ni déploiement manuel.

## Périmètre

| Tâche | Résultat |
| --- | --- |
| ADM-22 | File serveur complète, statuts en attente/traité/rejeté, ordre ancien d’abord, filtres UTC/UUID, totaux et curseurs exacts, historique conservé |
| ADM-23 | Préparation puis confirmation UUID/date/raison/portée, verrouillage serveur, une décision par dossier ouvert, demande figée et réessai exact |
| ADM-24 | Événement canonique acteur/date/cible/action/motif ; import fidèle des anciennes invalidations ; aucune réécriture des runs et résultats autoritaires |
| ADM-25 | Identité Auth réelle non anonyme et rôle admin courant en PostgreSQL, révocation avec même JWT, anciennes écritures/lectures directes révoquées, aucun rôle `dev` ajouté |
| ADM-26 | Quotas acteur, rejets audités sans rollback involontaire, motifs assainis, traces minimales, suppression physique quotidienne et anonymisation des acteurs |

Le [contrat](admin-moderation.md) distingue les commandes admises idempotentes des
refus d’accès/quota agrégés par fenêtre. Un rejet non admis peut être réessayé
après expiration de la limite ; il ne constitue pas un reçu terminal perpétuel.
`snapshotAt` borne les créations, pas les évolutions de statut entre deux pages.
Les horodatages de revue hérités ne sont ni supprimés ni reconstruits pour
forcer un invariant qui n’existait pas dans l’ancien schéma.

## Schéma et sécurité

Une migration est ajoutée, créée par la CLI :
`20261018082740_admin_audited_moderation.sql`, soit **72 migrations**. Les
**71 historiques**, les **24 bundles authority suivis** et le registre ne sont
pas modifiés. Le moteur reste `run-engine-0.2.5`, gameplay 24, hash
`9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa`.

Les deux tables privées ont une politique restrictive explicite de refus des
rôles API et aucun grant. Les deux anciennes tables publiques de modération
sont classées serveur uniquement, avec refus explicite des rôles navigateur ;
le manifest distingue ce cas des tables sans politique RLS. Aucune nouvelle exception de sécurité/advisor n’est
ajoutée. Quatre exceptions **INFO `unused_index` nommées**, mesurées ci-dessous,
reconnaissent uniquement les statistiques vides après reset ; elles expirent le
31 octobre 2026 comme le cycle de revue existant. Aucun warning générique n’est
ignoré et aucun plan n’est forcé pour obtenir la preuve.

Les trois nouvelles RPC publiques sont invoker. Les deux nouveaux definers
privés autorisés sont `private.admin_moderation(text,jsonb)` et
`private.report_daily_score(uuid,text)` ; les autres helpers restent sans grant
API. Le RPC public de signalement conserve son retour `VOID` et délègue au
contrôle privé. Le journal canonique et les compteurs privés n’ont aucun droit
API. L’ancienne invalidation et les accès directs aux signalements/journal
historique sont révoqués pour les navigateurs.

Le rollback applicatif conserve le checkpoint
`968c0b3ad3c2dfc3c2edffefe40e10aaebdeba5c` et sa dernière migration
`20261011134126` ; seule la migration courante requise devient `20261018082740`.
La fonction de purge existante et l’unique job nommé restent utilisés, désormais
quotidiennement à 04:43 UTC. Les seuils de 365/30 jours sont suivis d’une
suppression physique lors de la prochaine exécution quotidienne.

## Cas vérifiés

| Frontière | Preuve |
| --- | --- |
| File complète | Dossier ancien, 101e dossier, égalité de dates à la microseconde, filtres et compteurs calculés avant limite |
| Décision sûre | Mauvaise cible/date/portée, raison hors bornes, dossier déjà fermé, score non terminé/invalide, rejet d’un ancien signalement sur score déjà invalidé |
| Concurrence | Double commande et double clic : une seule décision ; clé réutilisée avec autre contenu refusée |
| Réseau | Réponse perdue : résultat inconnu, même UUID/contenu, reçu rejoué sans second effet |
| Suppression | Suppression du déclarant entre commit et réessai : reçu réconciliable ; acteur supprimé anonymisé ; historique préservé selon ses liens de confidentialité |
| Intégrité | Une faute d’audit annule toute la décision ; les données de run, commandes, résultats et score d’origine restent inchangées |
| Rôles | ACL anon/service, joueur, métadonnées forgées, Auth anonyme, admin révoqué, tentative de promotion et anciens accès directs refusés |
| Abus | Signalements invalides HTTP 400 et limites HTTP 429 conservent compteurs et événement minimal ; aucun signalement créé ; doublon sans réouverture |
| Limites | Réessai admis hors quota sans consommation supplémentaire ; rejet avant admission puis admission après fenêtre, suivi d’un reçu rejoué |
| Rétention | Purge réelle aux frontières 30/365 jours, dossiers ouverts conservés, raisons expirées neutralisées sans rétablir le score, seconde purge idempotente |
| UI | Lecture périmée sans action, filtres/pages/tab conservés, compte A→B→A, réponses tardives, purge globale sur `42501` et reçu 200 refusé |

## Preuves locales

| Contrôle | Résultat |
| --- | --- |
| Validation complète sur base fraîche | **295/295 tests**, 27 fichiers, zéro skip, **59,96 s** ; lint `results:[]`, permissions/advisors, index, 72 migrations et types concordants |
| Frontières des tables après clarification du manifest | **33/33**, 4,60 s ; absence de grant navigateur et refus RLS exact, aucune nouvelle exception de sécurité |
| Contrat advisors après clarification du manifest | **22/22**, 0,275 s |
| Traductions, copie source et page confidentialité | **70/70**, 2,70 s |
| Parseurs stricts | **97/97** |
| UI et asynchronisme | **30/30**, 4,45 s ; client RPC **8/8** |
| Navigateurs FR/EN | **4/4**, **14,7 s**, sans retry ; ancien/101e dossier, 320 px, clavier, axe, réponse perdue et reçu refusé |
| Parcours connecté final | **1/1**, **13,4 s**, sans retry |
| Ancienne application sur nouveau schéma | **10/10**, **1,38 s**, checkpoint inchangé |
| Assets | Reconstruction propre réussie, 1 036 fichiers |
| Sécurité/strict | Aucun high/critical npm ; quatre diagnostics upstream exactement autorisés, aucune extension |

Le parcours connecté réalise une vraie inscription navigateur, un signalement par
RPC, une décision sur PostgreSQL, le reçu dans le parseur/UI de production et un
réessai idempotent. La révocation de l’admin avec le même JWT produit un refus
audité et efface les données UI. Les scores terminés sont des fixtures locales
explicites ; ce test ne prétend pas rejouer le moteur. Les clés service restent
dans Node, les fixtures exigent un hôte loopback et leurs comptes sont supprimés.
Le parcours est obligatoire en CI connectée.

La revue visuelle mobile est réalisée hors commit. Les corrections issues des
parcours concernent les noms uniques des landmarks, la conservation des données
périmées à l’actualisation, le focus sur dossier/confirmation et les libellés qui
ne doivent pas annoncer une validité de score ni une absence d’action non prouvées.
Les fixtures de quotas sont indépendantes des changements de minute/jour UTC.

La couverture globale, les ordres aléatoires, le clone indépendant et les
résultats CI sont rapportés pour le **SHA final dans la PR**. Les premiers
contrôles ont notamment permis d’aligner les contrats de traduction et le
manifest des politiques explicites ; aucune exception de sécurité n’a été
introduite pour contourner ces contrôles.

## Mesures

Une transaction annulée contenant **20 000 dossiers** compare la requête avant
et après suppression de la matérialisation et utilisation des statuts bruts pour
les prédicats. Les JSON sont identiques. Première page ouverte : **52,383 →
14,834 ms** ; dossiers traités : **23,136 → 9,921 ms** ; page ancienne :
**21,284 → 13,013 ms** ; fenêtre UTC : **2,948 → 1,221 ms** ; UUID exact :
**0,061 → 0,053 ms**. Les 365 blocs temporaires des grandes pages disparaissent.
Le nouvel index `daily_score_reports_status_order` est utilisé sur la file traitée
et la fenêtre UTC, les index partiels existants sur les autres lectures. Les
mesures de requête interne sont séparées de celles du wrapper RPC ; elles ne
constituent pas une garantie de latence en production.

Sur **20 000 événements privés**, l’historique ordonné utilise
`moderation_events_target_order` (**0,166 ms**, 31 lignes). La suppression des
références de signalement utilise `moderation_events_report` (**5,732 ms**,
200 références). La purge exprime sa borne temporelle une seule fois : son index
`moderation_events_retention` est utilisé pour 400 expirations et ramène la
mesure de **4,881 à 0,398 ms**. Les fixtures et suppressions de cette mesure sont
annulées ; ces index sont réellement utilisés par les chemins métier concernés.

Le clone parent indépendant, sans alternates ni environnement privé et avec
cache npm vide, réussit `npm ci` et `check:build`. Il mesure 671 518 octets de JS
gzip, 226 494 initiaux, 231 297 pour Auth et 8 174 955 d’assets. Le dernier build
local ADM-S5 mesure 681 459 / 226 498 / 231 297 / 8 213 021 respectivement :
**+9 941** octets JS gzip et **+38 066** d’assets. Le nouvel espace différé mesure
10 670 octets gzip ; Auth conserve ses 10 entrées sans module admin. La marge
globale est de **11,4988 %** sous le budget v13. Le clone final est vérifié
séparément pour son SHA exact dans la PR.

Le budget **v13** passe à 770 000 octets JS et 8 250 000 d’assets. La marge minimale
de 10 %, les plafonds initial/Auth, chaque plafond de chunk préexistant et les
Web Vitals sont conservés. Cette révision suit les mesures et l’autorisation
antérieure de préserver la qualité du code.

## Livraison et limites

Les preuves de clone final et de CI sont liées au SHA final dans la PR. Aucun
nouvel ajustement économique, changement de gameplay, dépendance, image ou
asset binaire n’est introduit. Les sorties de tests et Graphify restent hors du
commit. La migration, l’exécution distante du cron, la fusion et les actions de
modération en production demeurent des opérations distinctes.
