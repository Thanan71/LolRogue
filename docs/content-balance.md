# Contrat de contenu et d'équilibrage

## Version et portée

Le modèle d'analyse `BALANCE_MODEL_VERSION = 2` décrit le contenu publié avec le
`gameplay_ruleset_version = 21` et le Daily `score_version = 15`. La calibration
early Top et le budget de formation global sont introduits en v18 ; la v19 publie
les règles système du sprint combat, la v20 la carte, l'économie et la progression
par participation, puis la v21 publie les gates mesurées de P0-BAL-02. Le moteur v20
est archivé pour terminer les runs déjà ouvertes. Toute autre modification d'ennemi,
récompense, prix, drop, effet ou stacking exige une nouvelle version et un nouveau
hash autoritaire.

La source machine est `src/game/balance/contentBalance.ts`. Le test
`contentCatalogAnalysis.test.ts` appelle `analyzeContentCatalog()` sur 100 seeds de
carte déterministes. Cette analyse parcourt tous les nœuds de toutes les branches et
résout leurs formations/récompenses avec un inventaire vide. Elle ne choisit aucune
route, ne conserve pas les PV/MP, n'achète et ne recrute rien, et n'exécute pas
`BattleManager` : un seed de carte analysé n'est donc pas une run.

Le contrôle sur 30 seeds de carte vérifie seulement un volume minimal de nœuds, des
bornes larges de récompenses et les trois raretés d'augments. Il ne constitue ni une
cohorte de runs scriptées, ni un playtest. Cette analyse statique ne produit pas la
baseline authority de calibration, construite séparément à partir de cohortes
authority versionnées.

Les vraies runs automatisées passent par `simulateAuthorityCohort()`. Cette fonction
pilote une session authority commande par commande, puis fait rejouer la trace
complète par `verifyAuthorityRun()` avec vérification terminale. Les tests
`authorityCohort.test.ts` et `authorityCohortMatrix.test.ts` couvrent ce chemin et sa
stratification ; ils ne transforment pas pour autant une politique automatisée en
comportement joueur.

## Baselines authority versionnées

La stabilisation early Top conserve `config/early-top-cohort-v17.json`,
`config/early-top-cohort-v18.json` et `config/early-top-cohort-v21.json` :
10 starters solo × Easy/Normal/Hard × 30 seeds
appariées, avec victoire de run, victoire du premier combat, encounter de mort dans les
trois premiers combats Top, ressources PV/MP, or, affordability et commandes de
reproduction des seeds extrêmes. Les fixtures sont régénérées par
`npm run balance:early-top:generate:v17`, `:v18` et `:v21` avec une sortie explicite ;
la commande sans suffixe génère la v21. `npm run balance:early-top:check` exige leur
reproduction byte-for-byte. La v17 fige le signal à 0 % avant tout tuning, la v18 la
sortie du blocage et la v21 les plages d'acceptation finales.

La première passe v18 a été pilotée par cette même matrice, via
`node scripts/generate-early-top-cohort.mjs --engine v18`.
La passe A ne modifie que le pool, la pression de nœud et le renfort Top ; le budget
de formation v17 reste `1.00` / `1.55` / `2.00` dans tous les biomes :

| Passe | Runs gagnées (Easy / Normal / Hard) | Premiers combats gagnés | Morts Top, 3 premiers combats | Morts terminales Top totales |
| --- | ---: | ---: | ---: | ---: |
| v17 | 0 / 0 / 0 sur 300 | 290 / 244 / 74 | 279 / 287 / 297 | 279 / 291 / 297 |
| A — Top uniquement | 0 / 0 / 0 sur 300 | 300 / 300 / 300 | 4 / 7 / 60 | 14 / 23 / 107 |
| B — budget formation versionné sur toute la run | 84 / 50 / 15 sur 300 | 300 / 300 / 300 | 4 / 7 / 60 | 14 / 23 / 107 |

La génération répétée est byte-identique (SHA-256
`441b333b0f5b1d63b003a7b4f55100e7eb9189d2f4b72c35b427bed89307e36d`). Elle prouve
que Top n'est plus la cause principale des défaites, mais que les morts sont déplacées
après Top. La case TODO est donc restée ouverte jusqu'à la seconde passe sur le budget de
formation. Des tests numériques couvrent Jungle, Mid, Bot, River et Base et figent
leurs valeurs v17 pendant cette première passe.

La passe B normalise ensuite le budget 1/2/3 starters à `0.61` / `0.95` / `1.22`
sur toute la run, en conservant presque exactement les rapports de formation
précédents. La passe A ayant prouvé que le problème n'était plus localisé à Top, ce
second étage respecte la clause du ticket « tant que le problème reste localisé ».
Les pools et règles spécifiques de Jungle, Mid, Bot, River et Base restent inchangés :
leurs tests numériques reconstruisent leur facteur de biome depuis `BIOME_INFO` et
isolent `enemyFormationMultiplier` comme seul changement commun. Les métriques de la
passe B restent identiques après publication ; seule l'enveloppe d'identité authority
v18 change. La double génération v18 est byte-identique (SHA-256
`bc12293b13df09d1aae329fce6f40054c78875362dce105657b6dbd6a82e9d42`). Easy atteint
ainsi 28,0 % avant toute retouche économique.

L'artefact v18 commité conserve aussi les dimensions de ressources et d'économie qui
ne figurent pas dans le résumé de victoire. Les valeurs suivantes sont les moyennes
pondérées des mêmes 300 runs par difficulté ; les flèches indiquent `v17 → v18` et les
visites abordables couvrent le shop observé par la fixture complète :

| Difficulté | PV après premier combat | MP après premier combat | Or gagné par run | Visites avec offre abordable |
| --- | ---: | ---: | ---: | ---: |
| Easy | 52,80 % → 96,31 % | 6,42 % → 44,35 % | 65,32 → 691,99 | 17/56 → 152/258 |
| Normal | 32,04 % → 95,03 % | 4,39 % → 35,46 % | 37,99 → 535,42 | 4/34 → 103/205 |
| Hard | 3,78 % → 82,14 % | 3,39 % → 25,68 % | 11,97 → 324,86 | 1/10 → 66/141 |

Cette table est une preuve de conservation avant/après, pas une cible causale. La
mesure Top-only ci-dessous reste la référence pour décider si l'économie early doit
être retouchée.

### Décision d'affordability early

`npm run balance:early-top:affordability` rejoue les mêmes 30 cellules × 30 seeds,
mais construit cette mesure depuis les observations brutes de chaque run. Seules les
visites dont `biome === 'top_lane'` sont retenues ; l'or gagné est la somme des rewards
des combats Top par run, et non le ledger de la run entière. Le rapport conserve pour
chaque visite son `nodeId`, son `commandIndex`, l'or à l'entrée, les offres et les
transactions rattachées au même nœud.

Le comparatif apparié ci-dessous oppose le bundle v17 archivé à la source de travail
après la passe B. Les flèches indiquent `v17 → passe B` ; les victoires de run restent
un contexte, pas une attribution causale à l'économie.

| Difficulté | Victoires | Or de combats Top moyen | Visites de shop Top | Or moyen à l'entrée | Offres abordables | Achats / recrues Top |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Easy | 0 → 84 | 24,76 → 79,21 | 38 → 60 | 29,58 → 33,50 | 0/172 → 0/280 | 0/0 → 0/0 |
| Normal | 0 → 50 | 20,36 → 85,82 | 29 → 60 | 31,24 → 36,83 | 0/129 → 0/280 | 0/0 → 0/0 |
| Hard | 0 → 15 | 6,28 → 83,55 | 9 → 58 | 24,33 → 41,72 | 0/39 → 9/270 | 0/0 → 9/0 |

Dans le snapshot authority actuel, une offre `legal` inclut déjà `gold >= cost` en
plus des contraintes d'inventaire ou d'équipe ; les compteurs `legal` et `affordable`
sont donc identiques dans cette cohorte. Le projet ne définit toutefois aucun seuil
minimal d'offres abordables en Top. La mesure observationnelle ne fournit pas non
plus le contre-factuel nécessaire pour attribuer les victoires ou défaites à un prix.
Elle ne justifie donc pas de tuning économique dans ce correctif : Easy est déjà dans
la zone préliminaire à 28,0 %, et les prix des bottes (300), de la potion (50) ainsi
que les récompenses `top_*` restent inchangés. L'effet causal de l'économie pourra
être isolé dans la calibration complète de `P1-BAL-02` avec un seuil explicite.

`npm run balance:early-top:affordability:generate:v17` et
`npm run balance:early-top:affordability:generate` exposent les deux rapports JSON.
Les métriques appariées restent identiques après publication ; seule l'enveloppe
d'identité authority v18 change. Deux générations propres de la passe B v18 sont
byte-identiques (SHA-256
`cd25f954f7a4483ac4718835134fb4a1765e7d71c50286247064e18f5d323de8`) ; la sortie v17
comparée porte le SHA-256
`80321fc646f27370d0fd7354b3be1c4550ef1f2a5b2bea2bfacf9a84787c2c4a`.

### Décision de survie des starters

La même cohorte de la passe B est agrégée par starter avec la notation
`victoires de run / premiers combats gagnés / morts dans les trois premiers combats
Top`. Chaque cellule contient 30 seeds ; le total contient donc 90 runs par starter.

| Starter | Easy | Normal | Hard | Total |
| --- | ---: | ---: | ---: | ---: |
| Annie | 4 / 30 / 2 | 1 / 30 / 3 | 0 / 30 / 19 | 5 / 90 / 24 |
| Ashe | 14 / 30 / 0 | 5 / 30 / 0 | 2 / 30 / 0 | 21 / 90 / 0 |
| Darius | 2 / 30 / 2 | 2 / 30 / 2 | 1 / 30 / 17 | 5 / 90 / 21 |
| Garen | 4 / 30 / 0 | 3 / 30 / 2 | 1 / 30 / 7 | 8 / 90 / 9 |
| Jinx | 12 / 30 / 0 | 10 / 30 / 0 | 3 / 30 / 3 | 25 / 90 / 3 |
| Leona | 10 / 30 / 0 | 5 / 30 / 0 | 2 / 30 / 0 | 17 / 90 / 0 |
| Lux | 10 / 30 / 0 | 6 / 30 / 0 | 2 / 30 / 2 | 18 / 90 / 2 |
| Malphite | 14 / 30 / 0 | 10 / 30 / 0 | 2 / 30 / 0 | 26 / 90 / 0 |
| Soraka | 7 / 30 / 0 | 3 / 30 / 0 | 1 / 30 / 11 | 11 / 90 / 11 |
| Warwick | 7 / 30 / 0 | 5 / 30 / 0 | 1 / 30 / 1 | 13 / 90 / 1 |

Ashe gagne 21 runs sur 90, remporte ses 90 premiers combats et ne subit aucune
mort early Top : elle n'est pas faible dans cette cohorte. Garen gagne 8/90, mais ce
signal n'est pas isolé puisque Annie et Darius sont à 5/90. Il remporte lui aussi ses
90 premiers combats et ses 9 morts early sont inférieures aux 24 d'Annie, 21 de
Darius et 11 de Soraka. Rien ne démontre donc le besoin d'un buff individuel de
survie pour Ashe ou Garen ; leurs statistiques défensives restent inchangées.

Warwick gagne 13/90 runs, remporte ses 90 premiers combats et ne compte qu'une mort
early Top. Cette matrice ne contredit donc pas la gate : aucun buff de statistique ou
de sort ne lui est appliqué avant la correction de son E et de l'IA prévue par
`P1-BAL-01`.

La comparaison n'agrège pas le MP entre starters : Garen n'utilise pas de mana, ce
qui rendrait cette dimension trompeuse. `npm run balance:early-top:starters` verrouille
les 30 cellules et la décision no-op. Deux générations Node 24 de
`scripts/generate-early-top-cohort.mjs --engine v18` sont byte-identiques au
SHA-256 `bc12293b13df09d1aae329fce6f40054c78875362dce105657b6dbd6a82e9d42`.

### Gate de non-régression P0-BAL-04

`npm run balance:early-top:catalog-gates` réutilise directement les deux suites de
P0-BAL-04 au lieu de recopier leurs valeurs. `economyBalance.test.ts` conserve ses six
invariants sur le snowball des augments, les budgets Silver, le tirage pondéré des
raretés, les tiers par biome et la Base, l'échantillon déterministe de 10 000 drops et
la hiérarchie Gold/Prismatic. `economyBalanceRuleset.test.ts` conserve le contrat v17
append-only, le score sans points d'or gagné et son wrapper service-role.

Les neuf tests passent sous Node 24 sans modifier les catalogues d'augments, les
tables de drops, les items, les encounters ou les règles de contenu. La stabilisation
early Top ne compense donc pas sa difficulté en rouvrant P0-BAL-04.

La baseline courante v21 est chargée depuis
`config/authority-cohort-baselines-v21.json` et reproduite par la source v21. Elle
couvre les 45 cellules du profil PR sur 30 seeds appariées : difficulté, composition
d'équipe, maîtrise, runes, enhancements et politique restent visibles séparément.
Les sept baselines authority v15 à v21 restent reproductibles ; v15 à v20 sont des
archives immuables dont les identités moteur/hash/modèle/policy sont littérales et dont
la reproduction emploie exclusivement leur bundle versionné, jamais les constantes du
moteur courant.

`npm run balance:baseline:generate` génère la v21 sur la sortie standard ; l'option
`-- --output config/authority-cohort-baselines-v21.json` met à jour son artefact
commité. Les commandes `balance:baseline:generate:v15` à `:v20` servent uniquement à
auditer les archives historiques. Une nouvelle publication ajoute son propre couple
fixture/loader/JSON sans réécrire les versions précédentes.
`npm run balance:baseline:check`, inclus dans `npm run balance:artifacts:check`, exige
une reproduction byte-for-byte des sept artefacts.

### Gates de cohortes P0-BAL-02

`npm run balance:cohort -- --profile pr --output-directory balance-report` exécute
45 cellules × 30 seeds. `authorityCohortAcceptance` regroupe 15 familles sémantiques
et n'échoue sur la hiérarchie Easy ≥ Normal ≥ Hard que lorsque les intervalles Wilson
révèlent une inversion significative. La même exécution mesure la concentration des
morts et compare 1 170 métriques au golden v21 commité : baisse de victoire supérieure
à 5 points, recul médian supérieur à 0,5 biome ou dérive économique supérieure à 10 %.

La mesure de référence passe sans violation. Hard/Top concentre 178 morts sur 444
(40,09 %) ; sa borne Wilson basse de 35,64 % reste sous le seuil d'échec strict de
40 % et produit donc un avertissement visible, pas un succès masqué. Le golden rend
une dérive non approuvée bloquante ; lorsqu'il est volontairement régénéré, son diff
reste la preuve à approuver en revue de PR. La CI conserve le rapport
`authority-cohort-acceptance.json` pour les profils PR, nightly et release, exécutés
respectivement avec 30, 500 et 1 000 seeds par cellule.

### Matrice de combat des champions

La preuve d'acceptation combat est distincte des cohortes de runs. Elle énumère les
126 partitions complémentaires de cinq champions parmi les dix maintenus, joue
chaque partition avec les côtés inversés et réutilise les mêmes 30 seeds. Chaque
runtime exécute donc 7 560 combats automatisés au niveau 1. Un taux décisif exclut
les draws de son dénominateur et le gate P1 exige au moins une victoire **et** une
défaite pour chaque champion ; un draw ne peut ainsi masquer un taux réel de 0 %.

`npm run balance:combat:matrix:generate` sélectionne le moteur `current` dans
`config/authority-versions.json` et, par défaut, son prédécesseur gameplay. Le moteur
précédent est chargé depuis son bundle archivé, puis le candidat est exécuté depuis
son bundle et sa source. Le rapport contient les identités réellement résolues et
exige une parité source/bundle exacte.

La table historique de publication combat ci-dessous compare v18
(`9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17`) à v19
(`45a1dbb93be5a25281ba6fce56517be382ddff6210dce9a55ef3d1ac7c971099`). Les valeurs
entre parenthèses sont les deltas candidat − baseline. Le bundle v18 ne publiait pas
le mana dans `action_select` : sa variation est donc notée `n/d` plutôt que transformée
artificiellement en zéro.

| Champion | Victoires (Δ pp) | Dégâts PV/round (Δ) | Soins/round (Δ) | Shield absorbé/round (Δ) | Mana/round (Δ) | Actions CC/combat (Δ) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Garen | 33,17 % (-9,78 pp) | 35,60 (-41,52) | 1,07 (+1,02) | 7,08 (+5,75) | 0,00 (n/d) | 0,00 (0,00) |
| Annie | 43,36 % (-1,20 pp) | 28,27 (-103,29) | 0,00 (0,00) | 4,89 (+4,27) | 13,11 (n/d) | 0,28 (+0,28) |
| Ashe | 47,35 % (+1,42 pp) | 46,23 (-111,49) | 0,00 (0,00) | 0,00 (0,00) | 18,12 (n/d) | 1,96 (+1,33) |
| Darius | 52,35 % (+9,40 pp) | 83,33 (+6,43) | 2,00 (+1,92) | 0,00 (0,00) | 17,29 (n/d) | 0,00 (0,00) |
| Lux | 42,06 % (-3,58 pp) | 28,57 (-213,83) | 0,00 (0,00) | 5,25 (+5,04) | 14,65 (n/d) | 0,00 (0,00) |
| Soraka | 63,17 % (+17,24 pp) | 29,42 (+5,21) | 74,20 (+65,83) | 0,00 (0,00) | 24,53 (n/d) | 0,00 (0,00) |
| Jinx | 46,16 % (+0,22 pp) | 54,70 (-140,92) | 0,00 (0,00) | 0,00 (0,00) | 18,06 (n/d) | 0,00 (0,00) |
| Leona | 71,19 % (+26,57 pp) | 90,84 (-63,49) | 0,00 (0,00) | 5,67 (+5,28) | 24,62 (n/d) | 4,54 (+3,52) |
| Malphite | 61,98 % (-36,52 pp) | 77,95 (-333,86) | 0,00 (0,00) | 7,49 (-0,32) | 22,44 (n/d) | 1,79 (-0,26) |
| Warwick | 39,18 % (-3,77 pp) | 37,63 (-2,48) | 11,18 (+6,09) | 0,00 (0,00) | 20,54 (n/d) | 1,89 (+1,03) |

Les dix champions ont des victoires et des défaites décisives : le gate minimal de
P1-BAL-01 passe sans retuning supplémentaire. Ce résultat ne valide pas les seuils
P0 de 45–55 % et d'écart maximal de 10 points : sept champions sont encore hors de
la plage et l'écart du roster atteint 38,02 points. Ces seuils restent ouverts et
doivent être traités par leur calibration dédiée, pas assouplis dans ce rapport.

Le rapport courant `config/champion-combat-matrix-current.json` compare désormais
v20 au moteur v21
(`c0b776b628006a779a618fb2abfa00a3ff99fd27d27980dfdec54378fc4d81a3`). Les 7 560
combats de chaque runtime donnent, pour le candidat, Garen 49,15 %, Annie 49,31 %,
Ashe 52,33 %, Darius 48,55 %, Lux 47,75 %, Soraka 48,23 %, Jinx 50,66 %, Leona
50,11 %, Malphite 50,32 % et Warwick 53,60 %. Tous restent dans la plage 45–55 % ;
l'écart Lux–Warwick est de 5,85 points, sous le maximum de 10. La parité
source/bundle v21 est exacte et chaque champion conserve des milliers de victoires
**et** de défaites, sans draw utilisé pour masquer un résultat.

La publication P0-BAL-05 archive également le bundle v17 byte-for-byte et publie
`run-engine-v18` avec le hash
`9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17`. Le catalogue
gameplay et le barème Daily v17 sont recopiés à l'identique dans les versions 18 :
seuls le namespace Daily et les identités gameplay/moteur progressent. Le score reste
en version 15 avec zéro point d'or, et la migration vérifie les deux parités avant
d'activer v18.

P0-BAL-05 ferme uniquement le blocage de stabilisation historique. La publication
v21 mesure ensuite 258/300 premiers combats gagnés en Easy, 249/300 (83,0 %) en
Normal et 224/300 (74,67 %) en Hard, sans aucun starter à zéro. Elle conserve aussi
de vraies défaites : seulement 25/300, 14/300 et 6/300 runs complètes gagnées.
Ces mesures ferment la gate automatisée P0-BAL-02 sans transformer l'autoplay en
objectif de taux de victoire ; les playtests humains restent ouverts dans P2-BAL-01.

### Gate P1-BAL-02 carte et économie

`config/map-economy-baseline-v20.json` conserve la publication historique et
`config/map-economy-baseline-v21.json` porte l'identité courante sur les mêmes
mesures byte-identiques. Chaque artefact analyse 1 000 seeds avec une programmation
dynamique sur le DAG de chaque carte. `npm run balance:map-economy:check` exige la
reproduction v21 byte-for-byte et borne, sur la run complète, l'écart entre routes à
trois combats et une élite. Chaque chemin traverse un shop en Jungle et un recrutement
en Mid ; seule la Base se termine par un boss.

Le premier shop Jungle propose toujours une potion. Le gate
`mapEconomyAffordability.test.ts` rejoue 1 200 runs, stratifiées en 30 cellules ×
40 seeds, et exige pour Easy, Normal et Hard qu'au moins 50 % des premières visites
Jungle contiennent une offre abordable. Les composants coûtent 100–250 gold hors
potion d'entrée, BF Sword 500–650 et les recrues 150–300.

Le repos ajoute 20 gold par membre après le premier pour un soin partiel et 40 pour
un soin complet. Le seuil d'efficacité est fixé à `≤ 5×` la potion par gold afin de
préserver la qualité du soin d'équipe ; `mapEconomyBaseline.test.ts` le vérifie pour
les deux types de repos, les effectifs de un à cinq et une référence de 150 PV pour
50 gold. La v20 réduit aussi le trésor sans risque, conserve les issues négatives
inabordables sous forme de contrepartie ou d'absence de gain, et recrute au niveau
`max(runLevel + 1, médianeEquipe - 1)`.

Enfin, le progression ruleset v3 répartit un budget de candies de compte fixe selon
les vagues et biomes réellement parcourus dans le ledger v2. Recruter tard ne réduit
donc plus le budget global et la part individuelle reflète la participation. Cette
gate ferme P1-BAL-02 ; les playtests humains consentis restent explicitement ouverts
sans invalider les gates automatiques P0-BAL-02.

## Indicateurs de catalogue et de nœuds

Pour chaque nœud de combat généré et chaque difficulté, `meanEncounterPower` agrège
`niveau × statMultiplier`, `meanNodeGoldReward` la récompense d'or et
`meanNodeDropChance` la probabilité de drop. Les prix, le nombre d'augments et leur
stacking proviennent directement des catalogues. Ces valeurs sont des indicateurs
comparatifs non pondérés par un choix de route, pas des métriques de run ni une
promesse de taux de victoire.

Les attentes actuelles sont : Easy < Normal < Hard pour puissance et or, drops
indépendants de la difficulté, prix strictement positifs et inventaire/stacking
conformes aux règles.
Le rapport est déterministe pour les mêmes seeds de carte et doit être comparé
avant/après toute modification de contenu.

## Roster maintenu

| Champion | Rôle produit | Forces | Faiblesses | Synergies conseillées |
| --- | --- | --- | --- | --- |
| Garen | frontline autonome / exécution | durabilité, zone, finition | courte portée, peu de contrôle | Lux, Soraka, Ashe |
| Annie | burst / contrôle | magie, stun, zone | fragile, mana, faible sustain DPS | Leona, Malphite, Warwick |
| Ashe | carry distance / contrôle | ralentissement, portée, engage | fragile, peu mobile | Leona, Soraka, Garen |
| Darius | bruiser cumulatif | duel long, soin, exécution | courte portée, stacks | Leona, Lux, Soraka |
| Lux | mage utilitaire | portée, bouclier, contrôle | fragile, cooldowns | Garen, Jinx, Malphite |
| Soraka | support sustain | soins, silence, stabilité | fragile, faible pression seule | Darius, Warwick, Jinx |
| Jinx | hypercarry à resets | DPS, zone, accélération | fragile, démarrage lent | Leona, Lux, Soraka |
| Leona | tank engage | contrôles, initiation, résistances | dégâts seuls faibles | Ashe, Jinx, Annie |
| Malphite | tank anti-physique | armure, engage de zone | mana, moins fort contre magie | Annie, Lux, Jinx |
| Warwick | bruiser sustain | soin, poursuite, contrôle cible | portée, sensible au burst | Lux, Soraka, Ashe |

## Identité des biomes

Les mécaniques actuelles sont des choix de carte réellement générés, pas des effets
de combat annoncés sans handler :

- **Top Lane — duels d'attrition :** difficulté initiale et branches modérées ;
- **Jungle — exploration ramifiée :** carte la plus longue, davantage de branches,
  événements, trésors et recrutements ;
- **Mid Lane — pression arcanique :** trajet court, élites et shops plus présents ;
- **Bot Lane — formations duo :** ennemis carry/protection et routes économiques ;
- **River — risque/récupération :** pression élite compensée par repos et trésors ;
- **Base — siège final :** trajet court, aucun événement aléatoire, forte pression
  élite puis boss.

L'identité visuelle normative (pierre/ardoise, forêt/vert, arcanes/violet-or,
côte/azur, eau/cyan, forteresse/rouge-or) doit guider les futurs backgrounds sans
ajouter d'asset non livré.

## Gouvernance des encounters

Un encounter n'entre dans un pool publié que si tous ses champions existent, ses
effets passent `catalogSupport`, son résultat est géré par le client **et** par
`AuthorityRunEngine`, et un test déterministe couvre succès, capacité et erreur.
Ajouter seulement du texte ou une probabilité sans handler ne constitue pas du
contenu jouable.

Le ruleset v13 ajoute `top_fortified_duel`, `jungle_hunted_camp`,
`mid_arcane_lockdown`, `bot_frozen_vanguard`, `river_guardian_current` et
`base_last_stand`. Ils emploient uniquement les dix champions et le combat déjà
supporté ; leurs formations, récompenses et probabilités sont couvertes par des
tests déterministes du résolveur de rencontres et du moteur authority.

## Télémétrie consentie et playtests

La télémétrie DB reste désactivée par défaut. Une calibration ne peut utiliser que
des agrégats consentis : version, difficulté, starter/team anonymisés, biome atteint,
résultat, durée, or gagné/dépensé, drops proposés/acceptés, augments proposés/choisis
et raison d'abandon. Aucun journal d'actions, email ou identifiant public n'est
nécessaire.

Pour une future cohorte authority d'au moins 30 runs par difficulté, consigner taux
de victoire, abandon par biome, médiane de durée/or, fréquence de choix et intervalle
d'incertitude. Une modification est proposée avec hypothèse et cible, évaluée via
`simulateAuthorityCohort()`, playtestée sur au moins deux compositions, puis
versionnée. Les taux produits par une politique automatisée restent des hypothèses
jusqu'à leur confrontation à des playtests humains consentis ; sans échantillon
suffisant, le TODO de calibration reste ouvert.
