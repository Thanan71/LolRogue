# Performance frontend

Dernière mesure bundle : **7 octobre 2026**, Node 24, build Vite de production local.

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
`performance-report/preview-report.json` par `npm run test:performance-preview`.

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
Web Vitals restent inchangés. `test:performance-budgets` reste bloquant ;
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
