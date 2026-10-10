# P3-CHAMP-01 — Veigar, campagne automatisée v22

Dans la sonde automatisée d'ouverture, Veigar gagne 24 des 30 premiers combats Top réels au niveau 1, contre 23 pour Annie et 23 pour Lux. La progression mesurée reste modeste avec cette politique : au maximum 9 points en Normal et 11 en Easy. Les compteurs, la restauration au plafond et les dégâts de R concordent entre le moteur source et le bundle Edge courant.

Cette campagne utilise des bots. Elle valide la reproductibilité et les bornes techniques ; elle ne démontre ni l'équilibre entre joueurs humains ni la préparation d'une release de production. Le faible nombre de victoires de run et l'absence de Veigar vivant après la Base empêchent de conclure sur son scaling naturel en fin de run.

Identité : `run-engine-v22`, hash `2e0c2b73796122049cd8493b56e9ed9329a9fde25e27addc71f553eb83025d84`. Le kit mesuré utilise E à 60/55/50/45/40 mana et R à 7/6/6 tours de récupération. L'artefact complet est [veigar-run-progression-balance-v22.json](../../config/veigar-run-progression-balance-v22.json). Les anciens artefacts et bundles v21 restent inchangés.

Reproduction avec Node 24 :

```sh
npm run edge:bundle
npm run balance:veigar:generate
npm run balance:veigar:check
npx vitest run tests/veigarRunProgressionBalance.test.ts tests/championRunProgression.test.ts --maxWorkers=1
```

Les trois duos Garen + Veigar/Annie/Lux utilisent les mêmes 30 seeds, en Normal puis en Easy : 180 runs par runtime, exécutés dans le moteur source et le bundle Edge exact. Maîtrises, améliorations et runes initiales sont vides. La politique `survival-greedy@1` est identique ; ses recrutements, objets et choix d'augments restent actifs. Les formations et équipements peuvent donc diverger pendant la run. Chaque trace complète est vérifiée à nouveau jusqu'à son état terminal ; commandes, résultats et observations sont identiques entre source et Edge. Chaque observation contient sa commande `balance:repro` et son seed.

`balance:veigar:check` est inclus dans `balance:artifacts:check`, appelé par `balance:check`. La CI contrôle donc aussi la reproduction exacte de cet [artefact v22](../../config/veigar-run-progression-balance-v22.json).

| Difficulté | Mage | Victoires de run / 30 | Combats gagnés / joués | Dégâts du mage, moyenne des 30 runs |
| --- | --- | --- | --- | --- |
| Normal | Veigar | 0 | 293 / 323 (90,71 %) | 2 900,20 |
| Normal | Annie | 1 | 329 / 358 (91,90 %) | 3 504,00 |
| Normal | Lux | 0 | 374 / 404 (92,57 %) | 3 711,50 |
| Easy | Veigar | 1 | 406 / 435 (93,33 %) | 3 876,13 |
| Easy | Annie | 1 | 414 / 443 (93,45 %) | 3 982,63 |
| Easy | Lux | 1 | 397 / 426 (93,19 %) | 3 444,50 |

La moyenne de dégâts inclut les runs interrompus par une défaite. Elle reflète aussi leur durée, les recrutements et l'équipement ; elle ne mesure pas uniquement la puissance intrinsèque du kit. En Normal, les dégâts moyens de Veigar valent 82,77 % de ceux d'Annie et 78,14 % de ceux de Lux. En Easy, ils valent 97,33 % et 112,53 %. Ces comparaisons appariées décrivent cette politique précise, sans seuil arbitraire de victoire de run.

Les points du passif correspondent à autant de puissance permanente supplémentaire. Les valeurs suivantes excluent l'AP de niveau, des objets et des augments. `Atteint` compte les runs qui ont obtenu un snapshot dans le biome. La moyenne « atteints » utilise leur dernier snapshot autoritaire dans ce biome, y compris après une défaite, avec les points réellement conservés. `Vivants au snapshot` compte Veigar vivant dans ce dernier snapshot. `Terminé` compte une transition vers le biome suivant ou la victoire finale. `Vivants à completion` compte Veigar encore vivant après cette completion. Une population absente produit `null` dans l'artefact ; aucun biome non atteint ni aucune mort ne devient un compteur artificiellement nul.

| Difficulté | Biome | Atteints | Vivants au snapshot | Terminés | Vivants à completion | Points / bonus AP, atteints | Points / bonus AP, survivants |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Normal | Top | 30 | 25 | 26 | 25 | 0,60 | 0,72 |
| Normal | Jungle | 26 | 19 | 22 | 19 | 2,42 | 2,68 |
| Normal | Mid | 22 | 13 | 18 | 13 | 3,64 | 3,38 |
| Normal | Base | 8 | 0 | 0 | 0 | 5,63 | Non observé |
| Easy | Top | 30 | 27 | 30 | 27 | 0,77 | 0,81 |
| Easy | Jungle | 30 | 24 | 27 | 24 | 2,30 | 2,58 |
| Easy | Mid | 27 | 18 | 26 | 18 | 3,67 | 3,83 |
| Easy | Base | 18 | 0 | 1 | 0 | 5,17 | Non observé |

La victoire Easy avec Veigar n'est pas une observation de Veigar vivant en fin de run : les autres membres gagnent après sa mort. Le rapport conserve séparément le nombre de runs terminés et le nombre de survivants. Le maximum observé reste très loin du plafond 200 ; les sondes contrôlées suivantes valident le plafond sans prétendre qu'il a été atteint naturellement.

La sonde d'ouverture utilise le premier encounter Top réellement généré pour chaque seed, avec un seul mage au niveau 1 et zéro point initial. Le préfixe de commandes est exécuté puis vérifié indépendamment dans les deux runtimes. Les ressources ennemies et l'identité de l'encounter figurent dans l'artefact.

| Mage | Victoires d'ouverture / 30 | Dégâts moyens | Points moyens après ce combat |
| --- | --- | --- | --- |
| Veigar | 24 (80 %) | 365,53 | 0,53 |
| Annie | 23 (76,67 %) | 362,00 | 0 |
| Lux | 23 (76,67 %) | 327,80 | 0 |

La sonde supplémentaire au niveau 5 contre Garen, depuis zéro point, produit 0 victoire sur 30 pour chacun des trois mages. Veigar inflige en moyenne 575,53 dégâts, Annie 722 et Lux 508. Ce duel défavorable sert de contrôle de dégâts ; son absence de victoires ne permet pas de distinguer la jouabilité des trois kits.

R est testé au rang 1 et au niveau 18 contre une cible neutre sans résistance, bouclier ou passif. La puissance intrinsèque passe de 127 à 327 avec 200 points : le bonus vaut exactement +200. Les dégâts totaux avant écrêtage par les PV sont :

| Points restaurés | Points effectifs | Cible à 100 % PV | À 50 % PV | À 0,1 % PV |
| --- | --- | --- | --- | --- |
| 0 | 0 | 249 | 373 | 498 |
| 200 | 200 | 389 | 583 | 777 |
| 999, entrée de domaine contrôlée | 200 | 389 | 583 | 777 |

Le multiplicateur de PV manquants suit `1 + fraction_de_PV_manquants` et ne dépasse pas 2. Le contrôle numérique tolère un point pour l'arrondi entier du dégât de référence. Les mêmes dégâts au-delà du plafond montrent que des points supplémentaires ne produisent plus d'AP. Les sauvegardes externes supérieures au plafond sont rejetées par le validateur strict ; le cas 999 teste uniquement la restauration interne bornée.

Les tests ciblés couvrent aussi les gains exclusifs normal/élite/boss, l'absence de points sur simple hit ou assistance, l'identité des ennemis dupliqués, les revives, les camps d'un miroir Veigar, la frappe différée unique de W, les hooks génériques et la copie immuable des stats. Cette campagne rapporte le kit final sans ajustement supplémentaire de ses stats. Une mesure humaine et davantage de runs avec Veigar survivant en Base restent nécessaires avant toute affirmation sur le scaling de fin de run.
