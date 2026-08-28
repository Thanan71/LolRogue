# Contrat de contenu et d'équilibrage

## Version et portée

Le modèle d'analyse `BALANCE_MODEL_VERSION = 1` décrit le contenu publié avec le
`gameplay_ruleset_version = 17` et le Daily `score_version = 15`. Le contenu de
combat par biome introduit en v13 reste inchangé. Le moteur v16 est archivé pour
terminer les runs déjà ouvertes. Toute autre modification d'ennemi, récompense,
prix, drop, effet ou stacking exige une nouvelle version et un nouveau hash autoritaire.

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

La stabilisation early Top conserve en plus `config/early-top-cohort-v17.json` : 10 starters
solo × Easy/Normal/Hard × 30 seeds appariées, avec victoire de run, victoire du premier
combat, morts terminales dans les trois premiers combats Top, ressources, or,
affordability et commandes de reproduction des seeds extrêmes. La fixture est régénérée
par `npm run balance:early-top:generate` et vérifiée par
`npm run balance:early-top:check`. Elle fige le signal v17 à 0 % avant tout tuning.

La première passe v18 candidate a été pilotée par cette même matrice, via
`node scripts/generate-early-top-cohort.mjs --engine working --output <fichier-temporaire>`.
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
isolent `enemyFormationMultiplier` comme seul changement commun. La double génération
est byte-identique (SHA-256
`25d1d5d2bb0a41ca6fcf409ff64584261a5b8404e8f894f12f2ffebc22b32170`). Easy atteint
ainsi 28,0 % avant toute retouche économique.

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
Deux générations propres de la passe B sont byte-identiques (SHA-256
`954ec7c263d5247ebb246d0a202f10cbe2db47fe73ea7b6b483196cd643a9128`) ; la sortie
v17 comparée porte le SHA-256
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
`scripts/generate-early-top-cohort.mjs --engine working` sont byte-identiques au
SHA-256 `25d1d5d2bb0a41ca6fcf409ff64584261a5b8404e8f894f12f2ffebc22b32170`.

La baseline courante v17 est chargée depuis
`config/authority-cohort-baselines-v17.json` et reproduite par la source v17. Les
baselines v15 et v16 restent des archives immuables : leurs identités
moteur/hash/modèle/policy sont littérales et leur reproduction emploie exclusivement
`run-authority-v15.bundle.ts` ou `run-authority-v16.bundle.ts`, jamais les constantes
du moteur courant.

`npm run balance:baseline:generate` génère v17 sur la sortie standard ; l'option
`-- --output config/authority-cohort-baselines-v17.json` met à jour son artefact
commité. Les commandes `balance:baseline:generate:v15` et
`balance:baseline:generate:v16` servent uniquement à auditer les archives
historiques. Une nouvelle publication ajoute son propre couple fixture/loader/JSON
sans réécrire les versions précédentes. `npm run balance:baseline:check`, inclus
dans `npm run balance:check`, exige une reproduction byte-for-byte des trois
artefacts.

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
