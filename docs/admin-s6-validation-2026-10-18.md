# Validation ADM-S6 — 18 octobre 2026

Parent : `4abb2b2806bcf3fbcba6700abad004a5444f5e1c` (`dev`, après PR #228 et #229).
Branche : `feat/adm-s6-technical-diagnostics`. Application **0.2.12**, patch notes
FR/EN publication **17**. PR vers `dev`, sans fusion ni opération distante manuelle.

## Périmètre livré

| Tâche | Résultat |
| --- | --- |
| ADM-27 | Journaux conservés parcourables avec filtres et compteurs serveur, curseurs à la microseconde, collecte facultative OFF par défaut, lecture bornée à 14 jours |
| ADM-28 | Tentatives paginées, statuts et codes distincts, versions séparées, rejets techniques/contrat/non classés, aucune accusation déduite d’un rejet |
| ADM-29 | SLI et p95 seal → terminal sur sources serveur existantes, buckets UTC vides explicites, disponibilité HTTP/taux d’erreur/latence de requêtes non instrumentés |
| ADM-30 | Liens de tentative validés avec le propriétaire du log, projection minimale des données héritées, isolation des buffers et corrélations entre identités |
| ADM-31 | Politique authority réutilisée, quinze minutes UTC closes, observations dédupliquées, escalade et rétablissement prudents, runbook et absence de notification automatique |

Le [contrat](admin-diagnostics.md) précise les périmètres distincts de la liste,
des alertes et du service. Le snapshot borne les créations, pas les changements
de statut ; les logs optionnels ne constituent jamais un journal exhaustif.

## Schéma et intégrité

Une migration créée par la CLI : `20261018100541_admin_technical_diagnostics.sql`,
soit **73 migrations**. Les 72 précédentes ne sont pas modifiées. Le moteur
`run-engine-0.2.5`, gameplay 24, le hash
`9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa`, le registre
et les 24 archives restent identiques au parent.

La façade publique est invoker ; le seul nouveau definer privé directement
autorisé est `private.admin_diagnostics(text,jsonb,jsonb,timestamptz,integer)`.
Il vérifie l’identité Auth non anonyme et le rôle administrateur courant avant
les paramètres et les cibles. Les helpers ont un search_path vide et sont révoqués
aux rôles API. Les lectures brutes de `logs` sont retirées aux navigateurs, même
administrateurs ; l’ingestion authentifiée passe par la RPC existante. Les
opérations de maintenance et les fixtures privilégiées restent côté Node/SQL.

Aucune écriture de gameplay, récompense, rôle supérieur, collecte globale ou
notification n’est ajoutée. Aucune nouvelle exception de sécurité n’est ajoutée. Les trois exceptions advisors ajoutées sont uniquement des
INFO `unused_index` nommées, mesurées ci-dessous et expirant le **31 octobre**.

## Cas et preuves locales

| Contrôle | Résultat |
| --- | --- |
| Base fraîche complète | **330/330**, 28 fichiers, zéro skip, 80,31 s ; lint, ACL/RLS, advisors, index, migrations et types concordants |
| Diagnostics SQL finaux | **34/34**, 7,87 s ; chaque réponse réelle passe le parseur de production, dont les méthodes Auth sûres |
| Contrats/client/incidents | **96/96**, 0,42 s ; types stricts, horodatages exacts, partitions, secrets, annulation et transitions d’incident |
| UI et régressions avant complément de libellé | **48/48**, 3,13 s ; A→B→A, requêtes tardives, état périmé, refus global et maintien des ressources |
| Libellé nonterminal/backlog et catalogue | **92/92**, 3,05 s ; started=1/pending=1 n’est pas présenté comme un seal bloqué |
| Catalogue bilingue et copies source | **103/103**, 13,82 s ; module enregistré sans exclusion |
| Source navigateur | **4/4**, 20,1 s, sans retry ; EN 320 px, clavier, axe sans violation et aucun débordement horizontal |
| Connecté réel | **1/1**, 12,3 s, sans retry ; Auth et start réels, RPC/projection/UI, corrélation et retrait admin sur le même JWT |
| Anciennes frontières de logs | **4/4**, 1,58 s ; inspection physique de sanitation/purge côté serveur, lecture owner/other/admin navigateur explicitement refusée |
| Sécurité npm | Aucun high/critical |

Le connecté crée les comptes depuis le navigateur et démarre une tentative par
le vrai RPC. Son log de diagnostic est une fixture SQL Node explicite ; il ne
prétend pas représenter une télémétrie collectée ni un replay. Aucun état Auth ou
réseau n’est injecté dans ce parcours ; les clés privilégiées restent dans Node,
les hôtes sont limités au loopback et les comptes sont nettoyés. La CI connectée
inclut explicitement ce scénario.

Les nouveaux cas couvrent notamment le 101e log, les dates égales à six décimales,
les bornes UTC, les rôles anonymes/forgés/révoqués, le snapshot ancien qui ne
contourne pas la rétention, les textes hérités et les liens intercomptes, les
seals immatures ou issus d’un start ancien, le backlog hors période, l’absence
d’échantillons et les alertes répétées. Une revue croisée des calculs et du
contrat a corrigé l’acceptation des deux labels Auth sûrs et le libellé du compteur
nonterminal, avec tests purs, SQL réels et UI.

Les résultats globaux de couverture, de rollback, de reconstruction indépendante,
la CI et la preview sont consignés dans la PR sur son SHA final. Ils ne sont pas
déduits des seuls contrôles ciblés de ce document.

Le probe du candidat de maintenance passe **10/10**, 1,65 s, sur le schéma 73.
Son clone indépendant, sans alternates et avec cache npm initialement vide, passe
le postinstall complet et le build. La vérification finale des documents, des
contrats Auth/corrélation/lifecycle et des migrations passe **103/103**, 2,34 s.

## Mesures SQL

Fixtures locales de **20 000 logs et 20 000 tentatives**, annulées après mesure,
sans forcer le planner. Ce sont des mesures locales, pas des latences de production.

| Lecture | Temps d’exécution | Plan |
| --- | ---: | --- |
| Première page | 0,025 ms | `logs_diagnostic_order` |
| Session diagnostic | 0,388 ms | `logs_diagnostic_session_order` |
| Tentative et propriétaire | 0,193 ms | `logs_diagnostic_attempt_order` + clé primaire attempt |
| Vue d’alertes | 42,718 ms | agrégation, aucun bloc temporaire |
| Service 31 jours/heure | 62,837 ms | 744 buckets ; agrégations groupées, aucun scan par bucket ni bloc temporaire |

Les starts et les seals sont agrégés séparément avant la jointure aux tranches.
Une comparaison JSON avec la référence par bucket confirme le même résultat,
y compris start hors période/seal dedans et backlog hors période. Aucun seuil
de précision n’est abaissé pour obtenir la mesure.

## Bundle et retour arrière

Le parent indépendant à cache npm vide mesure JS gzip **681 459**, initial
**226 498**, Auth **231 297** et assets **8 213 091** octets. Le module Diagnostic
est chargé à la demande et absent de la fermeture Auth. Le budget v14 conserve
10 % de marge, les plafonds initial/Auth, ceux des chunks et les Web Vitals ;
seuls les plafonds globaux JS/assets deviennent **780 000 / 8 300 000** octets.
Les mesures définitives sur clone indépendant sont rattachées au SHA livré en PR.

Le candidat indépendant mesure JS gzip **693 857** (+12 398), initial **226 818**,
Auth **231 621** et assets **8 253 163** octets, soit **11,04 % de marge JS**.
Sa fermeture Auth conserve 10 entrées et exclut les modules admin ; Diagnostic
mesure **45 351 octets bruts / 14 235 gzip**. Aucun asset ou dépendance n’est ajouté.

Le checkpoint pré-S6 `968c0b3a` lit directement les logs et n’est plus compatible
avec cette surface admin. Le candidat `f812673f8ed35afe8ff31fdc421e3c34112e8309` enregistré dans `config/application-rollback.json`
comprend le client RPC et son UI sur le schéma 73. Il constitue un **candidat de
maintenance compatible**, pas un retour au comportement brut pré-S6 ni un
déploiement de production déjà sain. Un opérateur doit préparer et vérifier un
déploiement sain correspondant avant promotion ; le probe local ne remplace pas
ce smoke test. La migration n’est pas inversée pour rétablir un ancien accès.
