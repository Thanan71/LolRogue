# Arbres d’amélioration — audit courant et limites des preuves

Le [rapport Markdown généré](audits/enhancement-trees.md) et le [JSON exhaustif](audits/enhancement-trees.json) couvrent **72 nœuds de rôle + 16 spécialisations**, soit **88 IDs dans le catalogue SQL 4**. Le schéma déclaratif portable est versionné séparément en `schemaVersion: 1`. La [validation initiale TREE-01](tree-01-validation-2026-10-21.md) reste un relevé historique du catalogue 3 ; ses divergences SQL et effets anciens ne décrivent plus le code courant.

## Catalogue, disponibilité et possessions

Les six graphes de rôle conservent leurs 72 IDs. Ils n’ont aucun cycle, parent inconnu, doublon ou seuil supérieur au plafond réel de maîtrise 4. **57 nœuds de rôle ont un chemin légal ; 12 sont explicitement désactivés pour mécanique non supportée ; 3 autres héritent d’un parent désactivé.** Le modèle SQL extrait des migrations et le validateur client concordent sur les 88 définitions et leurs chemins publiés. Cette concordance de sources ne prouve pas un état déployé.

| Rôle | Désactivés directement | Blocages hérités uniquement |
| --- | --- | --- |
| Assassin | `assassin_mobility_1`, `assassin_mobility_2`, `assassin_mobility_3` | — |
| Combattant | `fighter_duelist_1` | `fighter_duelist_2`, `fighter_duelist_3` |
| Mage | `mage_burst_3` | — |
| Tireur | `marksman_survival_3` | — |
| Support | `support_tanky_3`, `support_utility_1`, `support_utility_2`, `support_utility_3` | — |
| Tank | `tank_support_1`, `tank_support_3` | `tank_support_2` |

Les motifs restent précis : absence de déplacement, broussailles, invisibilité, proximité, interception ou répétition de sort selon le nœud. Les trois descendants restent présents dans le catalogue ; leur achat et leur activation sont refusés même si l’ancien parent désactivé apparaît dans les rangs possédés. Les IDs et leurs reçus ne sont pas supprimés : un remboursement exige la dépense attestée.

Le premier tag du champion choisit le rôle ; les tags secondaires ne changent pas cet arbre. Le repli client reste Fighter, sans autoriser un champion absent du catalogue serveur. Garen, Annie, Soraka et Jinx ont chacun deux voies de spécialisation de deux nœuds ; une extension ne s’applique que si le rôle sélectionné correspond au rôle rédigé pour ce champion. Les 16 extensions sont **publiées mais leur gate d’achat serveur reste fermé** avant validation humaine.

Les spécialisations coûtent 80 puis 120 Candies, demandent maîtrise 2 puis 3, possèdent un rang et excluent les deux nœuds de la voie opposée. Le JSON expose séparément le refus actuel et le chemin conditionnel si la gate est ouverte. Fermer les nouveaux achats ne révoque pas une possession déjà attestée ni un snapshot de run figé. Pour calculer ces possessions, le service ouvre explicitement cette capacité puis filtre les rangs et leurs ancêtres avec le contrat commun.

## Contrat, agrégation et effets

`src/game/enhancements/contract.ts` valide la forme JSON, les IDs, rangs, cycles, exigences AND/OR, rangs minimaux et exclusions symétriques. `eligibility.ts` décide l’éligibilité, les rangs actifs et le plan minimal déterministe. Un budget éventuel utilise la dépense historique `totalCandiesSpent`, jamais le prix actuel recomposé. Aucun plafond global de Candies n’est actuellement publié.

`EnhancementService.calculateStatBonuses` filtre les possessions via `getActiveEnhancementRanks` puis appelle **`aggregateEnhancementBonuses` dans `src/game/enhancements/bonuses.ts`**. L’ancien `_processNodes` n’existe plus. L’agrégateur additionne les stats fois le rang, copie chaque effet une fois et refuse les rangs hors entier sûr `1..maxRanks`. Le helper seul n’atteste pas un achat légal.

Les textes et consommateurs corrigés sont décrits contribution par contribution dans le JSON : Tir Déchirant tire sa probabilité de 15 % et répartit les dégâts vrais ; le bouclier Phénix traverse le résolveur de combat ; Combustion augmente la puissance ; Canalisation utilise dix points de hâte ; l’identité de formation et le camp distinguent les cibles miroirs. Les effets de proximité et de déplacement absents restent descriptifs et désactivés. L’aperçu secondaire et le runtime partagent les unités de pénétration, vol de vie, omnivampirisme, ténacité et hâte.

Les nouveaux nœuds utilisent seulement les mécanismes existants : durabilité/exécution Garen, burst/hâte et défense Annie, soin/protection d’équipe Soraka, initiative/dégâts conditionnels Jinx. L’attaque rapide n’ajoute pas d’action ; l’aura Soraka concerne toute l’équipe avec porteur vivant ; le burst Annie ne multiplie que R ; l’exécution ne modifie aucun seuil d’ultime. Ces limites sont conservées dans les descriptions et les tests.

## Économie et comparaison reproductible

Le rapport inclut `createEnhancementEconomyReport()` et ses hypothèses de cohortes, seed, fréquence, durée supposée et probabilités de victoire. Il s’agit de scénarios d’épargne indépendants, pas de rétention mesurée ; un même portefeuille ne peut pas financer simultanément tous les objectifs rapportés. Voir la [décision économique](enhancement-economy.md) : prix conservés et réinitialisations répétées gratuites avec remboursement audité.

| Rôle | `supportedRanksMaximumCandies` | `reachableMaximumCandies` |
| --- | ---: | --- |
| Assassin | 650 | null |
| Combattant | 650 | null |
| Mage | 780 | null |
| Tireur | 780 | null |
| Support | 500 | null |
| Tank | 750 | null |

Le premier champ additionne les rangs supportés et cumulables du rôle. Le second répond à une autre question : tous les nœuds de ce rôle peuvent-ils être acquis ? Il reste null car chaque rôle comporte au moins un chemin fermé. Les voies spécialisées exclusives ne sont pas additionnées comme un build légal.

La fixture `tests/helpers/enhancementSpecializationComparison.ts` compare **48 combats autoplay** : quatre champions, quatre builds, trois seeds, niveau 5 et budget de 200 Candies. Elle utilise les kits réels et produit dégâts par tour, soins, excès de soin, dégâts reçus, survie et durée. Les 48 combats de cet échantillon se terminent par une défaite. Certains gains conditionnels ne s’observent pas dans ce scénario. Ce résultat ne démontre ni équilibre global, ni taux de victoire, ni qualité de la progression ; il ne remplace pas l’essai humain requis pour ouvrir la gate.

## Preuves SQL et remboursements

L’extracteur part des 72 lignes du seed, contrôle les copies 1→2→3 puis projette la copie 3→4 et l’expansion SQL de huit voies sur deux rangs. Il ne maintient pas une seconde copie des 88 définitions. Les paramètres d’achat, motifs de désactivation, portée champion, conditions, exclusions, gate et budget sont comparés au client. Toute nouvelle mutation de catalogue ou de configuration privée non reconnue échoue explicitement.

Les migrations suivies incluent :

- `20261022161216_enhancement_contract_v4_purchases.sql` : catalogue 4, comptes enregistrés, gate privée fermée, révision et contrat d’achat.
- `20261022162313_enhancement_atomic_resets.sql` : exigences récursives avec maîtrise/rangs, catalogue attendu, devis et remboursement atomique.
- `20261022164033_admin_enhancement_analytics.sql` : métriques agrégées de dépenses, remboursements et cohortes de runs figées, sans identifiants de joueurs dans la sortie admin.

La RPC v2 exige rang, révision et catalogue attendus. Le wrapper historique à quatre paramètres utilise la même implémentation privée. Les verrous joueur, arbre et catalogue protègent l’écriture ; les commandes idempotentes conservent leur réponse et ne débitent qu’une fois. Les invités, sessions Auth anonymes, rôles `anon` et `service_role` ne peuvent pas utiliser ces RPC comme un compte enregistré. Les administrateurs restent soumis aux mêmes règles pour leurs achats personnels.

Le devis de reset suit les reçus d’achat complets de la génération courante ; après l’introduction du ledger, chaque coût doit correspondre au débit exact. Un historique incomplet ne devient jamais un remboursement estimé. Un arbre vide, un dépassement de solde ou une révision/politique périmée est refusé. Le reset préserve maîtrise, Shards, propriété des champions et snapshots figés ; il incrémente révision et compteur de resets. L’association entre un build figé et des résultats de runs est descriptive et ne prouve aucun effet causal.

## Exécution et provenance

```sh
npm run testing -- enhancements audit
npm run testing -- enhancements audit --check
npx vitest run tests/enhancementGraphAudit.test.ts tests/enhancementEffectEvidence.test.ts tests/enhancementServerEvidence.test.ts tests/enhancementAuditReport.test.ts tests/enhancementAuditCli.test.mjs tests/enhancementEconomySimulation.test.ts
```

La génération reste locale et ne requiert ni réseau ni identifiants. Elle capture les imports, les sources physiques citées, les composants et styles de l’UI, ainsi que tous les fichiers et la liste des migrations. Les SHA-256 sont stables, sans timestamp ou commit auto-référent. Une modification concurrente invalide la génération ; la publication des deux rapports passe par une étape temporaire avec restauration en cas d’erreur. `--check` compare les octets sans écrire.

Les tests transactionnels utilisent une base locale jetable :

```sh
npm run database -- validate --yes
```

Ils comparent les 88 lignes réelles au modèle, vérifient 57 achats autorisés et 31 refus correspondant aux 12 désactivations, 3 héritages et 16 gates, puis contrôlent permissions, refus atomiques, concurrence, idempotence et snapshot figé. Des suites séparées vérifient exigences déclaratives, resets, reçus et confidentialité des métriques. Décrire ces assertions ne prétend pas qu’une invocation courante de ce générateur les a exécutées.

Les preuves de tests source, reprise réelle du moteur historique, bundle Edge exact, parcours navigateur, CI et validation humaine sont consignées séparément lors de leur exécution. Ce rapport ne certifie aucun déploiement, état distant ni approbation humaine. Les bundles et hashes historiques sont des artefacts immuables ; leur présence dans les sources ne suffit pas à prouver un rejeu.
