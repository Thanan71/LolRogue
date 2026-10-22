# TREE-01 — Audit des arbres d’amélioration

L’audit couvre les six arbres de rôle et leurs 72 nœuds. Il décrit le comportement actuel, sans modifier les achats, les effets, les arbres sauvegardés ou les règles de combat. Les corrections appartiennent à TREE-02, TREE-03 et TREE-04.

Le [rapport détaillé Markdown](audits/enhancement-trees.md) contient six graphes dirigés et une fiche par ID. Le [rapport JSON](audits/enhancement-trees.json) fournit les mêmes données et les empreintes des entrées, avec textes FR/EN, rangs, branche, coûts, maîtrise, parents, visibilité, attributs SQL, consommateurs runtime, responsables et suites prévues.

## Résultat et causes

**57 nœuds sont achetables par le client, 15 sont bloqués.** Aucun cycle, parent absent, ID dupliqué ou nœud structurellement inaccessible n’est présent dans le catalogue courant. Aucun seuil de maîtrise ne dépasse le plafond réel de niveau 4. La maîtrise et la structure sont vérifiées séparément de la disponibilité des effets.

| Rôle | Indisponibilité directe | Descendants bloqués uniquement par leur parent |
| --- | --- | --- |
| Assassin | `assassin_mobility_1`, `assassin_mobility_2`, `assassin_mobility_3` | — |
| Combattant | `fighter_duelist_1` | `fighter_duelist_2`, `fighter_duelist_3` |
| Mage | `mage_burst_3` | — |
| Tireur | `marksman_survival_3` | — |
| Support | `support_tanky_3`, `support_utility_1`, `support_utility_2`, `support_utility_3` | — |
| Tank | `tank_support_1`, `tank_support_3` | `tank_support_2` |

Un nœud directement indisponible peut aussi hériter du blocage d’un parent. Les catégories du tableau sont disjointes : 12 directs et 3 uniquement hérités. Chaque fiche conserve tous les chemins de cause ; leur nombre ne doit pas être confondu avec le nombre de nœuds.

Le composant affiche les nœuds centraux et ceux de la branche sélectionnée, y compris les nœuds indisponibles ; son bouton suit `canUnlockNode`. Le test de sélection couvre tous les champions exposés par `championDB.getAll()`, identifie les 11 kits maintenus et contrôle la sélection du premier tag, le repli Combattant et la concordance avec le rôle principal SQL. Un champion à plusieurs rôles conserve cette règle existante.

Les coûts sont constants à chaque rang, les parents doivent posséder au moins le rang 1 et chaque nœud a son propre maximum. Le coût minimal d’un achat depuis un état vide déduplique les ancêtres partagés et respecte tous les parents. Le rapport calcule aussi le coût du rang maximal et le total du catalogue ; aucun budget global ou choix de branche exclusif n’existe actuellement. `candyBudget: null` exprime cette absence de règle, sans présumer le solde d’un joueur.

## Catalogue et preuve SQL

Les **72 IDs, rôles, coûts, rangs maximaux, seuils de maîtrise et listes de parents** concordent entre les données client et le catalogue serveur actif, version 3, reconstruit à partir des migrations commises. Cette projection hors ligne ne prouve aucun état distant.

La RPC d’achat n’applique pas le filtre de disponibilité des effets du client. Le modèle SQL trouve donc un chemin pour les 72 nœuds ; les 15 blocages client produisent autant de divergences d’éligibilité depuis un état vide. Les tests sur une base locale jetable appliquant les 73 migrations confirment l’éligibilité des 72 achats, avec leurs parents déjà possédés. Ce dernier test isole les conditions de la RPC : il ne prétend pas exécuter 72 parcours complets depuis zéro. Une séquence légale de trois achats Garen depuis zéro est testée séparément.

Ces tests contrôlent également huit refus atomiques, l’absence de dépense et de ledger après refus, la concurrence de deux commandes, leur rejeu idempotent, les droits d’accès et le snapshot figé au départ d’une run. Un administrateur achète pour son propre compte avec les mêmes contraintes. Les rôles SQL `anon` et `service_role` n’ont pas le droit d’exécuter cette RPC publique. Les comptes invités locaux ne déclenchent aucune dépense serveur. La connexion anonyme Supabase est désactivée dans la configuration locale testée ; la fonction SQL ne contient pas de filtre spécifique `is_anonymous`, ce qui reste une limite conditionnelle si cette configuration change.

Aucune base distante n’est interrogée ou modifiée. Les migrations, le schéma, les permissions et les historiques sont inchangés.

## Effets et suites

La disponibilité d’un achat et la qualité de son effet sont deux axes différents. Chaque contribution est classée `implemented`, `partial` ou `descriptive` avec une observation concrète, un consommateur et un responsable. Un bonus statistique peut être implémenté mais inaccessible à cause de son parent.

| Observation reproduite | Suite |
| --- | --- |
| Phénix : le runtime émet un bouclier de survie, mais le chemin de dégâts du combat ne consomme pas cet effet instantané. L’utilisation est consommée une fois par combat ; le délai de 60 secondes décrit n’est pas appliqué. | TREE-03 / TREE-04 : définir le contrat et aligner le consommateur du bouclier |
| Tir Déchirant : le saignement s’applique à chaque attaque de base éligible avec dégâts aux PV, sans tirage à 15 %. Arrondis, dégâts vrais, durée en tours et instances cumulées sont testés. | TREE-03 / TREE-04 : choisir puis vérifier la formule, la probabilité et le cumul |
| Combustion : le bonus actuel augmente la puissance de 15 %, sans constituer un multiplicateur général de dégâts. | TREE-03 : harmoniser texte et calcul |
| Canalisation : `0.1` dans `percentBonuses.abilityHaste` devient 10 points ; cette statistique secondaire n’est pas montrée dans l’aperçu. | TREE-03 / TREE-04 : clarifier unités et aperçu |
| Effets non supportés et descendants | TREE-02 / TREE-03 : décider de leur activation ou de leur désactivation explicite, puis aligner le serveur |

Le rapport couvre aussi résurrection, renvoi, auras, caps, conditions, contrôles, rangs et absence de proximité. Huit contrats transversaux relient agrégation des rangs, aperçu/combat, snapshot, authority, Daily officiel, moteurs historiques et séparation de la progression intra-run de Veigar et identité des combattants. Un test de combat miroir reproduit aussi un saignement appliqué au mauvais camp lorsque les deux combattants partagent le même identifiant de champion ; cette collision relève de TREE-04. Les tests constatent les divergences ; ils ne les corrigent pas dans ce lot.

L’authority reste `run-engine-0.2.5`, gameplay 24, hash `9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa`. Les bundles historiques, leurs identités et le catalogue SQL version 3 sont conservés.

## Entrées, responsabilités et erreurs

| Module | Responsabilité |
| --- | --- |
| `src/data/enhancementTrees.ts`, contenu i18n | Catalogue client et libellés FR/EN |
| `EnhancementService`, `EnhancementTree`, store | Sélection du rôle, disponibilité, affichage et orchestration d’achat |
| `tooling/enhancements/graphAudit.ts` | Analyse pure, causes et plans d’achat ; entrées invalides explicites |
| `tooling/enhancements/effectEvidence.ts` | Matrice des comportements observés, consommateurs et correctifs à suivre |
| `tooling/enhancements/serverEvidence.ts` | Extraction SQL délibérément limitée aux migrations connues, comparaison des attributs et conditions d’achat |
| `tooling/enhancements/report.ts` | Projection exhaustive et rendu Markdown, sans effet sur le jeu |
| `scripts/audit-enhancement-trees.mjs` | Capture des sources et répertoires, empreintes, génération et contrôle des deux sorties |

Le générateur exige toutes les données attendues. Un parent inconnu, un cycle, un ID dupliqué, un coût/rang invalide ou un seuil impossible est représenté par une cause testée. Une mutation SQL non reconnue échoue explicitement et impose de revoir l’extracteur plutôt que de supposer une concordance. Une entrée manquante, une option inconnue, un rapport absent/périmé ou une source modifiée pendant le contrôle produit une sortie non nulle.

La génération capture les octets des imports et des migrations, ainsi que la liste des migrations. Elle vérifie leur stabilité avant publication, prépare les deux fichiers et restaure les sorties précédentes si la publication échoue. La commande de contrôle compare exactement les octets, sans écrire. Les empreintes sont déterministes ; aucune date de génération ou identité de commit auto-référente n’est injectée.

## Reproduction

Avec la version Node du dépôt et les dépendances installées :

```sh
npm run testing -- enhancements audit
npm run testing -- enhancements audit --check
npx vitest run tests/enhancementGraphAudit.test.ts tests/enhancementEffectEvidence.test.ts tests/enhancementServerEvidence.test.ts tests/enhancementAuditReport.test.ts tests/enhancementAuditCli.test.mjs
npm run typecheck
npm run check:static
```

La génération ne requiert ni réseau, ni connexion, ni identifiants Supabase. Les deux rapports sont suivis et déclarés dans le contrat des artefacts. Le contrôle exact est intégré à `check:static`, sans ajouter d’alias npm public.

La preuve transactionnelle nécessite Docker et la base locale jetable :

```sh
npm run database -- validate --yes
```

Cette commande réinitialise la base locale puis exécute lint, contrôle des types et tous les tests SQL ; ne pas la diriger vers une base distante. Les scénarios synthétiques couvrent branche valide, ancêtres partagés, cycle, référence manquante, doublon, budget et maîtrise maximale. Les tests de CLI couvrent déterminisme, contrôle sans écriture, modification concurrente des sources et restauration des deux sorties.

Le diff avant/après est un ajout d’audit : 72 fiches et six graphes vérifiés remplacent une hypothèse globale de 15 blocages. Les arbres, validations et effets de jeu restent identiques. Voir la [validation TREE-01](tree-01-validation-2026-10-21.md) ; les résultats CI, Preview et le SHA final sont consignés séparément dans la PR.
