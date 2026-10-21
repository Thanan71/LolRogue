# Performance frontend

Dernière validation bundle : **21 octobre 2026**, Node 24 et Vite **8.3.5**.

## ADM-S7 — isolation de l’interface

Parent `dev` indépendant : `bafc1c18969d7484aa9d511682fd035acb94b5b3`, clone
propre et cache npm vide, Node **24.19.0**. Le parent mesure **694 022 octets JS
gzip**, **226 971 initiaux**, **231 774 pour Auth** et **8 253 013 d’assets**.
La fermeture Auth contient **10 entrées sans module admin**.

La migration de 97 modules vers `features/administration` conserve les imports
différés Équilibrage/Modération/Surveillance et l’entrée de route légère.
Le candidat local validé mesure **699 097 octets JS gzip** (**+5 075**),
**227 272 initiaux** (**+301**), **232 069 pour Auth** (**+295**) et
**8 270 304 d’assets** (**+17 291**). Sa marge JS est de **10,37 %** et Auth
conserve **10 entrées sans module admin**. Aucun budget n’est ajusté ; build,
sécurité et typecheck passent localement.

La reconstruction indépendante finale, ses mesures et la CI/Preview restent à
rattacher au SHA livré dans la PR vers `dev`. Aucune nouvelle mesure Web Vitals
n’est déduite de ces tailles de bundle. Voir la
[validation S7](admin-s7-validation-2026-10-21.md).

## ADM-S6 — surveillance technique

Les mesures parent/candidat ci-dessous proviennent de la campagne du 18 octobre.
Les résultats du commit final avec Vite corrigé sont rattachés à la PR.

Le parent indépendant `4abb2b28` est reconstruit avec cache npm vide et postinstall
complet : JS gzip **681 459** octets, initial **226 498**, Auth **231 297** et
assets **8 213 091**. La fermeture Auth comporte 10 entrées sans module admin.

Le premier build mesuré ajoute environ 12 ko gzip au total et charge le module
Diagnostics séparément (environ 14 ko gzip). Les mesures définitives et la preuve
sur clone indépendant du SHA livré figurent dans la PR, avec la
[validation ADM-S6](admin-s6-validation-2026-10-18.md).

Le candidat de maintenance indépendant `f812673f` mesure **693 857** octets JS
gzip, **226 818** initiaux, **231 621** pour Auth et **8 253 163** d’assets.
Le module Diagnostic représente **14 235** octets gzip. La marge JS est de
**11,04 %**, sans module admin dans les 10 entrées de la fermeture Auth.

Le budget v14 passe de 770 000 à **780 000 octets JS gzip** et de 8 250 000 à
**8 300 000 octets d’assets**. La marge minimale de 10 %, les limites initial/Auth,
les plafonds de chunks et les objectifs Web Vitals restent identiques. Aucun
asset ni dépendance n’est ajouté ; les contrôles d’isolation restent actifs.

## ADM-S5 — modération auditée

Le clone parent indépendant `c1181954` mesure 671 518 octets de JavaScript gzip.
Le dernier build local ADM-S5 mesure 681 459 octets, soit **+9 941**. L’espace de
modération de 10 670 octets gzip est chargé à la demande ; le retrait de l’ancien
panel et de son canal de données réduit le chunk Admin principal. La route Auth
conserve ses 10 entrées sans module admin et mesure 231 297 octets, comme
le parent. Les assets passent de 8 174 955 à 8 213 021 octets.

Le budget v13 passe de 750 000 à **770 000 octets JS gzip** et de 8 200 000 à
**8 250 000 octets d’assets**. Les 10 % de marge minimale, les plafonds
initial/Auth, les plafonds de chunks existants et les Web Vitals sont conservés.
Les mesures finales, la comparaison à cache vide et les limites des preuves
figurent dans la [validation ADM-S5](admin-s5-validation-2026-10-18.md).

## Référence avant P2-PERF-01

Le plafond global choisi à cette étape était **398 000 octets gzip**. La
mesure initiale atteint **398 321 octets**, soit un dépassement de 321 octets et
aucune marge exploitable. La cible de travail est fixée à au moins 10 % sous ce
plafond, donc **358 200 octets gzip maximum**, sans modification de l'interface.

| Périmètre | Gzip | Part du total |
| --- | ---: | ---: |
| données champions complètes | 101,52 kB | 25,5 % |
| React 19, React DOM, Router et Zustand | 73,59 kB | 18,5 % |
| client Supabase | 53,90 kB | 13,5 % |
| entrée applicative | 45,99 kB | 11,5 % |
| page Admin | 8,23 kB | 2,1 % |
| page légale | 2,59 kB | 0,7 % |

La route initiale mesure 172 445 octets gzip et `/auth` 176 826 octets. React et
Supabase sont donc des coûts initiaux structurants. Admin et légal sont déjà des
chunks de route séparés et ne justifient pas de retirer des fonctions ou du contenu.

## Diagnostic

Toutes les pages sont déjà chargées avec `React.lazy`. Le principal gisement ne se
trouve donc pas dans un nouveau découpage visuel des routes, mais dans le catalogue
`champions-parsed.json` de 945 048 octets bruts : il contient les descriptions,
tableaux de cooldown/coût/portée et effets de tous les champions, alors que le combat
n'en supporte actuellement que dix.

La segmentation retenue doit préserver :

- les noms, titres, rôles, ressources, statistiques et icônes de tous les champions ;
- les noms et le statut de disponibilité des sorts affichés dans Database ;
- les données complètes des dix champions jouables ;
- le catalogue complet comme source auditée pour les assets et contrats serveur.

Elle peut sortir du JavaScript client les tableaux et descriptions qui ne sont jamais
affichés pour un sort indisponible, sans modifier le rendu ni les règles de combat.

## Résultat P2-PERF-01

Le catalogue client conserve les champs réellement affichés pour les 172 champions et
les données complètes des dix champions jouables. Le catalogue complet reste la source
auditée des assets et du bundle d'autorité. Cette segmentation ramène le chunk
`champion-data` de 101,52 kB à 52,92 kB gzip.

La mesure finale locale atteint **349 961 octets gzip**, soit **12,07 % de marge** sous
le plafond alors inchangé de 398 000 octets. Les cinq chunks les plus lourds possèdent aussi
un plafond individuel :

| Chunk | Mesure gzip | Budget |
| --- | ---: | ---: |
| React | 72 751 octets | 76 000 octets |
| Supabase | 53 495 octets | 56 000 octets |
| champion-data | 52 915 octets | 55 000 octets |
| entrée applicative | 45 806 octets | 48 000 octets |
| runStore | 29 774 octets | 32 000 octets |

Le rapport exhaustif par chunk est généré dans
`performance-report/bundle-report.json`. Le build conserve toutes les pages en imports
dynamiques et le contrôle du manifeste interdit à `/auth` de dépendre statiquement de
Database, Admin, légal ou des catalogues champions.

## Révision pour la passe UI animée

Le 13 août 2026, la décision produit privilégie les animations Combat/Carte, les
40 profils de compétences complets et la passe responsive de toutes les pages. Le
plafond global passe donc de **398 000 à 410 000 octets gzip**. Cette hausse reste
encadrée : la marge minimale de 10 %, les plafonds individuels des cinq chunks,
le chargement initial à 205 000 octets et `/auth` à 225 000 octets ne changent pas.

La mesure après cette passe atteint **360 110 octets gzip**, soit **12,17 % de
marge**. Le chargement initial mesure 172 792 octets, `/auth` 177 134 octets et le
paquet déployable 6 851 774 octets sur 7 200 000. Les métadonnées d'intégrité des
40 icônes Data Dragon ne sont pas livrées au navigateur : un manifeste client
compact conserve seulement la version et la correspondance champion/sorts.

La mesure Chromium sur une vraie instance `vite preview` a révélé que la région de
notifications globale déclenchait malgré tout `runStore` sur `/auth`. Elle est désormais
différée sur les routes publiques. La mesure finale de `/auth` charge dix ressources
JavaScript pour **184 308 octets transférés**, sans requête vers `champion-data`,
`DatabasePage`, `AdminPage` ou `LegalPage`. Le détail est écrit dans
`performance-report/preview-report.json` par `npm run testing -- performance preview`.

## Révision pour la calibration terrain

Le 6 septembre 2026, P2-BAL-01 ajoute au chunk Admin la comparaison des cohortes
terrain, deux politiques et leurs conditionnels. La mesure sur `dev` atteint
397 923 octets gzip ; la branche atteint 419 154 octets, soit +21 231 octets, dont
environ +20 108 dans le chunk Admin chargé à la demande. Le chargement initial ne
prend que 62 octets et la route `/auth` 99 octets : l'isolation des routes reste donc
effective.

Le budget versionné passe de **445 000 à 470 000 octets gzip**. Cette enveloppe
conserve **10,82 % de marge**, la règle minimale de 10 %, les cinq budgets de chunks,
les plafonds initial/Auth et le plafond de 7 200 000 octets pour les assets
déployables. Le relèvement couvre la fonctionnalité admin mesurée sans rendre le
chargement public plus lourd ni retirer de signal de calibration.

## Révision pour la traduction complète FR/EN

Le 23 septembre 2026, les catalogues explicites FR/EN couvrent les champions,
passifs, compétences et contenus de jeu. Le budget précédent ne couvre pas cette
augmentation fonctionnelle : le premier build atteint **610 140 octets gzip**,
avec un chunk `content` de 770 636 octets bruts. Le choix produit autorise une
hausse mesurée des plafonds pour conserver toutes les traductions.

Avant cette révision, la présentation française importait le catalogue de combat
complet puis en extrayait les textes à l'exécution. Le packaging produit désormais
`champion-content.fr-FR.json`, une projection limitée aux identifiants, noms, titres
et descriptions. La vérification des assets et un test exhaustif comparent chaque
champion, passif et compétence à la source complète : aucun texte n'est retiré ni
modifié. Les données d'autorité v21 restent identiques.

Cette projection économise **37 124 octets gzip** et **306 886 octets bruts** au
build. La mesure finale est :

| Périmètre | Mesure | Plafond |
| --- | ---: | ---: |
| JavaScript total gzip | 573 016 octets | 640 000 octets |
| Plus gros chunk brut (`content`) | 463 750 octets | 560 000 octets, inchangé |
| Chargement initial gzip | 212 114 octets | 215 000 octets, inchangé |
| Route `/auth` gzip | 216 171 octets | 225 000 octets, inchangé |
| Assets déployables | 7 667 822 octets | 8 000 000 octets |
| Chunk `content` gzip | 129 722 octets | 135 000 octets, nouveau contrôle |
| Chunk `index` gzip | 75 021 octets | 78 000 octets |
| Chunk `runStore` gzip | 32 800 octets | 34 000 octets |

Le plafond global passe de 480 000 à **640 000 octets gzip**, avec **10,47 % de
marge** et la règle minimale de 10 % conservée. Les plafonds React, Supabase,
champion-data, initial/Auth et Web Vitals restent inchangés. Le nouveau plafond
`content` rend le coût des traductions visible et bloquant dans les prochains
builds ; l'isolation du manifeste Auth reste vérifiée. Ces mesures décrivent le
bundle, pas une nouvelle mesure des Web Vitals.

## Révision pour la robustesse du stockage (P2-WEB-02)

Le 28 septembre 2026, les bornes JSON, les validateurs de réhydratation et la
protection des lectures SDK portent le total à **577 758 octets gzip**, soit
4 742 octets de plus que la référence FR/EN ci-dessus. `runStore` atteint
35 761 octets gzip. Le budget v4 conserve ces contrôles plutôt que de retirer
des validations pour réduire le bundle, conformément à l'autorisation produit
d'augmenter un plafond lorsque cela préserve la qualité.

Le plafond total passe de 640 000 à **650 000 octets** (+1,56 %) et celui de
`runStore` de 34 000 à **38 000 octets**. La marge totale devient **11,11 %** ;
la règle minimale de **10 %** ne change pas. Le chargement initial (213 334
octets) et Auth (217 391 octets) restent sous leurs plafonds inchangés de
215 000 et 225 000 octets. Les autres chunks, les assets et les limites
Web Vitals restent inchangés. `npm run testing -- performance budgets` reste bloquant ;
ces mesures de taille ne constituent pas à elles seules une mesure Web Vitals.

## Audit Web Vitals avant P2-PERF-02

La matrice de production observe déjà LCP, CLS et les entrées `event` utilisées pour
approcher INP sur son projet `mobile-chromium-production`. Elle compare ces valeurs à
`config/performance-budgets.json`. Le job GitHub Actions `e2e` exécute
`npm run test:e2e:production` sans `continue-on-error` : ce contrôle est donc
techniquement bloquant.

Ce contrôle ne constitue toutefois pas encore une gate de laboratoire stable :

- il ne produit aucun rapport Web Vitals archivable ;
- il repose sur un seul chargement non bridé du runner ;
- il accepte `INP = 0` lorsqu'aucune entrée d'interaction n'est observée ;
- il mélange la mesure Chromium mobile au smoke test fonctionnel de six projets ;
- il ne permet pas de suivre une distribution ou une tendance entre exécutions.

P2-PERF-02 conserve la matrice pour la compatibilité navigateur, mais déplace la
décision de budget dans une preview Chromium mobile dédiée, sous réseau et CPU
contrôlés, avec plusieurs échantillons et un rapport JSON uploadé par la CI.

## Résultat P2-PERF-02

La mesure dédiée utilise un warm-up non décisionnel, puis cinq contextes Pixel 5 sans
cache partagé sous 1,6 Mbit/s descendant, 750 kbit/s montant, 150 ms de latence et un
CPU ralenti ×4. Elle mesure `/auth`, exige une interaction Event Timing réelle lors du
passage en invité et calcule le p75 des cinq échantillons.

Mesure locale du **13 août 2026** :

| Vital | p75 | Budget laboratoire |
| --- | ---: | ---: |
| LCP | 1 396 ms | 2 500 ms |
| CLS | 0 | 0,1 |
| INP | 104 ms | 300 ms |

Le rapport `performance-report/web-vitals-report.json` conserve le warm-up, chaque
échantillon, le profil, les budgets et le SHA. Le job CI `build/assets` exécute la gate
après le build et archive le dossier complet pendant 30 jours. Speed Insights reste
une source terrain distincte, non bloquante et soumise à la revue confidentialité.

## Sprint G — budget des nouvelles fonctionnalités

Les filtres d’historique, diagnostics de rejet, publications et états de lecture
ajoutent du code produit. Le plafond global gzip passe de 650 000 à **660 000
octets** (+1,54 %) et le chargement initial de 215 000 à **220 000 octets**
(+2,33 %), conformément à la décision utilisateur du 7 octobre 2026.
La marge globale minimale de **10 %** reste obligatoire : le total doit donc
rester inférieur ou égal à **594 000 octets**. Les budgets par chunk, la route
Auth à 225 000 octets, les assets, LCP/CLS/INP et la couverture restent inchangés.

Les requêtes d’historique sont chargées à la demande. Les routes et catalogues
conservent le découpage de Vite et son préchargement standard. La mesure inclut
aussi le script de langue copié en fin de build, le SHA complet et un profil
Supabase configuré. Les preuves et les limites de livraison sont consignées
dans `docs/sprint-g-validation-2026-10-07.md`.

## P3-ECO-01 — budget de l'économie des champions

Le catalogue d'accès, les Éclats, les confirmations d'achat et leurs traductions
portent le plafond global de 660 000 à **670 000 octets gzip** (+1,52 %), avec
l'autorisation utilisateur du 8 octobre 2026. La marge minimale reste **10 %** :
le total effectif doit rester inférieur ou égal à **603 000 octets**.
Le chargement initial reste plafonné à 220 000 octets, Auth à 225 000 octets.
Les limites par chunk, les assets, les Web Vitals et les seuils de couverture
restent inchangés. La mesure finale figure dans
`docs/champion-economy-validation-2026-10-08.md`.

## Corrections UI/UX — budget global

Le 9 octobre 2026, la CI de la PR #201 mesure **606 610 octets gzip** après
les corrections UI/UX, les états de combat lisibles et la récupération de mot
de passe en FR/EN. Le plafond de 670 000 octets laisse alors **9,46 %** de marge,
sous le minimum obligatoire de 10 %.

Pour accompagner ces fonctionnalités tout en conservant la simplicité du code,
le budget v7 porte uniquement le plafond global à **690 000 octets**
(+2,99 %). La mesure CI conserve ainsi **12,09 %** de marge, et le maximum
effectif avec la règle de 10 % devient **621 000 octets**. Les catalogues et
leurs traductions conservent leur packaging actuel. Les budgets initial/Auth,
par chunk, d'assets et de Web Vitals, les seuils de couverture et les checks
existants restent inchangés.

## P3-CHAMP-01 — marge des routes initiale et Auth

La CI de la PR #203, au commit `2f1eab8`, mesure **219 793 octets gzip** au
chargement initial et **224 578 octets** pour `/auth`. Il ne reste respectivement
que 207 et 422 octets sous les plafonds v7. Le build clean-room du commit
`700668c`, avec son profil Supabase local, mesurait 220 261 et 225 047 octets.
Les deux profils doivent rester couverts par les budgets bloquants.

Conformément à l'autorisation utilisateur de relever les plafonds pour préserver
la qualité du code, le budget v8 porte le chargement initial à **225 000 octets**
(+2,27 %) et `/auth` à **230 000 octets** (+2,22 %). Les compteurs de run, le
catalogue Veigar et leurs traductions conservent le découpage et le chargement
standard de l'application.

Le total mesuré en CI reste à **613 318 octets gzip** sur un plafond de 690 000,
soit **11,11 % de marge**. La marge minimale obligatoire de 10 %, les plafonds par
chunk et d'assets, les Web Vitals et les seuils de couverture restent inchangés.
Cette mesure de taille ne remplace pas la vérification des Web Vitals.

## ARCH-S4 — modules et protection des requêtes obsolètes

Le build local final mesure **621 103 octets gzip** après l'extraction des modules
UI et du contrôle commun de compte. Le plafond v8 de 690 000 octets laisse
**9,985 %** de marge ; le maximum effectif de 621 000 octets est dépassé de
103 octets. Le contrôle partagé protège les réponses retardées et les départs
après A → B → A sans dupliquer l'état du compte.

Conformément à l'autorisation utilisateur de conserver la qualité du code, le
budget v9 porte uniquement le plafond global à **700 000 octets** (+1,45 %).
Avec la même marge obligatoire de **10 %**, le maximum effectif devient
**630 000 octets** ; la mesure locale conserve **11,27 %** de marge globale.
Les plafonds initial/Auth, par chunk, d'assets et de Web Vitals, ainsi que les
seuils de couverture, restent inchangés. La séparation des modules, les ports
explicites et les protections asynchrones sont conservés.

## ADM-S1 — définitions et fiabilité des données

Le premier build ajoute 15 297 octets d'assets déployables par rapport au même
build du parent `53f63629`, et atteint 8 009 358 octets. Le plafond de
8 000 000 octets est dépassé de 9 358 octets. Les définitions bilingues, états
indépendants et protections contre les réponses obsolètes restent dans leurs
modules habituels.

Conformément à l'autorisation utilisateur de préserver la qualité du code, le
budget v10 porte uniquement les assets déployables à **8 050 000 octets**
(+0,625 %). Le plafond JavaScript global de 700 000 octets, sa marge obligatoire
de 10 %, les budgets initial/Auth, par chunk et de Web Vitals restent inchangés.
Les mesures finales comparées au parent sont consignées dans la
[validation ADM-S1](admin-s1-validation-2026-10-17.md).

## ADM-S2 — fiches joueurs et historiques

Le premier build de ce lot ajoute 15 391 octets de JavaScript gzip au parent
`ae51c452` et atteint 642 427 octets. Sous le plafond v10, sa marge de 8,22 %
échoue au minimum bloquant de 10 %. Les traductions FR/EN portent l’initial à
226 373 octets et Auth à 231 177 ; les assets atteignent 8 070 267 octets.

Le budget **v11** porte le JS total à **730 000 octets**, l’initial à **230 000**,
Auth à **235 000** et les assets à **8 150 000**. Ce changement mesuré respecte
l’autorisation utilisateur de préserver les modules et la qualité du code.
Les 10 % de marge, plafonds par chunk, couverture et Web Vitals restent bloquants.
L’isolation Auth continue d’exclure les écrans admin, Database et données champions.
Les mesures finales et preuves figurent dans la
[validation ADM-S2](admin-s2-validation-2026-10-17.md).

## ADM-S4 — espace d’équilibrage différé

Le parent `ee3cf5b2` est construit dans un clone indépendant, sans alternates ni
configuration privée, sous Node 24 après `npm ci` avec un cache initialement vide.
Il mesure 656 280 octets de JavaScript gzip, 226 465 pour l’initial, 231 275 pour
Auth et 8 121 484 octets d’assets. Le premier build ADM-S4 mesure respectivement
671 270, 226 499, 231 305 et 8 174 038 octets. Sa marge globale de 8,05 % échoue
au minimum de 10 % ; les assets dépassent aussi leur ancien plafond.

Conformément à l’autorisation utilisateur de préserver la qualité du code, le
budget **v12** porte uniquement le total JS à **750 000 octets** (+2,74 %) et les
assets à **8 200 000 octets** (+0,61 %). La marge minimale de **10 %**, les plafonds
initial/Auth, les plafonds individuels existants et les Web Vitals restent
bloquants. L’espace est importé à la première visite et les lectures sont annulées
lorsqu’il est masqué ; les filtres restent conservés pour le retour à l’onglet.

La séparation des imports fait apparaître le catalogue traduit sous le nom
`championContent`, tandis que `content` conserve ses résolveurs. Le nouveau chunk
reçoit le même plafond individuel de **135 000 octets gzip**, en plus du contrôle
existant de `content`, afin de continuer à contrôler les données réellement
lourdes. Il ne s’agit pas d’un relèvement de leur budget individuel.

Les mesures finales et leurs limites figurent dans la
[validation ADM-S4](admin-s4-validation-2026-10-18.md).
