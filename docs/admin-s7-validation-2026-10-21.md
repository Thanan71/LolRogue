# Validation ADM-S7 — 21 octobre 2026

Parent : `bafc1c18969d7484aa9d511682fd035acb94b5b3` (`dev`).
Branche : `feat/adm-s7-administration-ui`. Application **0.2.13**, publication
**18** des patch notes FR/EN. Environnement de validation : **Node 24.19.0**.
Les commits de travail sont `3077e6d` (ADM-32), `bc64c5e` (ADM-33 amendé) et
`4539866` (ADM-34 automatisé). Ces identifiants ne constituent pas le SHA final
de livraison.

**Statut : S7 implémenté en code et couvert par les contrôles automatisés locaux ;
revue humaine VoiceOver/NVDA ouverte.** La PR doit cibler `dev`, sans fusion
implicite. Les résultats unitaires complets, le clone
indépendant, la CI et la Preview doivent être rattachés au SHA final dans cette PR.
Le build candidat local, les contrôles de sécurité et le typecheck passent.
Aucune livraison distante, migration distante, activation ou notification n’est
attestée par cette validation.

## Périmètre

| Tâche | Résultat local |
| --- | --- |
| ADM-32 | 97 modules migrés vers un module `features/administration` avec couches domain/infrastructure/hooks/ui, wrapper de route, entrée publique et garde d’imports |
| ADM-33 | Six groupes, sous-vues et contexte appliqué dans l’URL ; liens directs, historique, filtres validés et sélections joueur/run indépendantes |
| ADM-34 | Colonnes essentielles, détails, focus, clavier, FR/EN, 320 px et zoom natif 200–400 % validés automatiquement ; lecture humaine NVDA/VoiceOver non exécutée |
| ADM-35 | Matrice locale SQL/Auth/UI/E2E, populations aux seuils de pagination, rôles réels et reprise après interruption |
| ADM-36 | [Contrat d’interface](admin-interface.md), contrats KPI/rôles réutilisés, restauration et limites des preuves documentées |

Les définitions et populations restent celles des contrats
[métriques](admin-metrics.md), [exploration](admin-explorer.md),
[analytics](admin-analytics.md), [équilibrage](admin-balance.md),
[modération](admin-moderation.md) et [diagnostics](admin-diagnostics.md).
L’URL contient seulement les champs appliqués et identifiants administratifs
admis ; elle ne contient ni JWT, ni curseur, ni DTO. Les données personnelles
éventuellement présentes dans une recherche ou un identifiant doivent être
retirées des liens/captures partagés.

## Preuves exécutées localement

| Contrôle | Résultat observé |
| --- | --- |
| Couverture complète | **3 800 tests passés**, 304 fichiers ; 293 cas DB conditionnels exclus de cette passe générique et vérifiés séparément en base fraîche. Statements **86,80 %**, branches **79,76 %**, fonctions **89,92 %**, lignes **88,88 %** ; seuils inchangés et module administration inclus |
| Base locale fraîche | Reset et application des **73 migrations** ; **337/337 tests**, **29 fichiers**, **100,24 s**, aucun skip |
| Seuils de pagination | **5/5** cas : **0, 100, 101, 1 000, 1 001** joueurs ; chaque UUID apparaît une fois, total global et métrique serveur concordent, dernier curseur nul |
| Matrice source complète | **98/98**, 28 fichiers, zéro skip, **11,2 min** ; inclut les parcours complets défaite et six biomes |
| E2E existants | **21/21** verts |
| Nouveaux E2E interface | **5/5** verts : navigation, tables, historique et accessibilité automatisée FR/EN |
| Nouveau E2E connecté | **1/1** vert sur Supabase local réel : anonyme/utilisateur refusés, admin autorisé, révocation, 101 runs et reprise après une requête interrompue |
| Zoom natif | Extension Chromium utilisant le zoom navigateur : **200 % → 640 CSS px**, **400 % → 320 CSS px**, FR/EN ; actions, tableaux et export utilisables |
| Accessibilité automatisée | Clavier/focus et audits axe : **zéro violation** sur les parcours vérifiés |
| Frontières | Garde du candidat local : **539 fichiers, 2 481 imports, zéro violation** ; imports lazy conservés |
| Catalogues finaux | **87/87** contrôles bilingues et frontières après la correction finale des libellés de confidentialité |
| TypeScript | App, scripts et E2E vérifiés localement |

Ces E2E totalisent **27 cas verts**. Les fixtures SQL sont déterministes,
privilégiées uniquement côté Node et nettoyées ; aucune clé privilégiée n’est
livrée au navigateur. La preuve de volumes n’utilise pas la cohérence d’un seul
total comme substitut au parcours exhaustif des pages.

Les artefacts de zoom sont attachés aux résultats Playwright sous
`browser-zoom-<locale>-<pourcentage>.json`. Les captures contrôlées et mesures JSON de la
campagne finale sont publiées par le job navigateur dans `admin-ui-evidence`
(30 jours), avec leur SHA exact. Les sorties source/connecté/production sont
séparées pour préserver ces preuves ; aucun token ou trace Auth n’est inclus
dans cet artefact.
Les essais précédents restent des preuves locales datées, pas une validation de
la branche après toute modification ultérieure.

## Comparaison frontend

Le parent indépendant `bafc1c18969d7484aa9d511682fd035acb94b5b3`, reconstruit
sur clone propre avec cache npm vide, mesure :

| Mesure parent | Octets |
| --- | ---: |
| JavaScript total gzip | 694 022 |
| Chargement initial gzip | 226 971 |
| Fermeture Auth gzip | 231 774 |
| Assets déployables | 8 253 013 |

La fermeture Auth possède **10 entrées et aucun module admin**. Le candidat local validé mesure :

| Mesure candidat local | Octets | Écart parent |
| --- | ---: | ---: |
| JavaScript total gzip | 699 097 | +5 075 |
| Chargement initial gzip | 227 272 | +301 |
| Fermeture Auth gzip | 232 069 | +295 |
| Assets déployables | 8 270 304 | +17 291 |

La marge JS est de **10,37 %**, sans modification des budgets. La fermeture Auth
conserve **10 entrées et aucun module admin**. Le build local et les contrôles de
sécurité/typecheck passent. Le clone indépendant final du SHA livré et ses jobs
restent à joindre à la PR ; cette mesure locale ne les remplace pas. Les détails
et budgets restent centralisés dans [frontend-performance](frontend-performance.md).

## Rejouer et compléter la preuve

Utiliser Node 24.19.0 et une instance Supabase **locale jetable** configurée selon
les contrats de tests existants. Ne pas diriger un reset ou des fixtures vers un
projet distant. Les commandes publiques du dépôt sont :

```sh
node scripts/check-business-boundaries.mjs
npm run typecheck
npm run check:unit
npm run check:db
npm run test:e2e -- e2e/admin-navigation.spec.ts
E2E_REQUIRE_CONNECTED=1 npm run test:e2e -- e2e/admin-navigation-connected.spec.ts
npm run check:build
```

`check:db` doit terminer sans skip ; la présence du fichier de test ou d’une
variable ne suffit pas à prouver une connexion correcte. Le scénario connecté
exige les identifiants de l’instance locale et échoue dans sa gate obligatoire
si la cible ou les paramètres manquent. Les jobs de la PR doivent identifier le
SHA, la version Node, la cible locale, les commandes, compteurs et liens d’artefacts.
CI, Preview, fusion et déploiement restent des étapes distinctes.

- [ ] Exécuter le parcours humain NVDA/Firefox et VoiceOver/Safari ; noter
  appareil, versions, langue, parcours, résultat et anomalies dans la PR.
Avant fusion, vérifier dans la PR les résultats unitaires complets, la
reconstruction indépendante, les checks CI et le smoke test Preview du SHA final.
Ces preuves complètent le présent relevé local daté.

## Schéma, archives et retour arrière

S7 n’ajoute ni migration ni changement de permissions ; les 73 migrations
existantes constituent la base de la preuve. Le registre authority, le moteur
`run-engine-0.2.5`, le gameplay **24** et les bundles archivés gardent leurs
versions et leur contenu. Aucun résultat historique, gain Candies, événement
d’arbre, appareil ou connexion manquante n’est reconstruit. ADM-20 attend TREE-10.

Un retour arrière restaure un frontend précédent compatible avec le schéma et
les RPC actuels, après les contrôles du [runbook](incident-runbooks.md#rollback-applicatif).
Il ne réactive pas les anciennes lectures brutes de logs et ne réinitialise pas
la base. Conserver les journaux, snapshots, archives authority, versions et
preuves de chaque release. Une réussite locale ne désigne pas un déploiement
historique comme sain et ne vaut pas exercice de restauration distante.
