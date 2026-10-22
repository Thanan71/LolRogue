# TREE-09 — Économie des améliorations

Les améliorations utilisent les **Candies du compte**. La maîtrise conserve séparément les Candies de participation attribuées au champion. Les acquisitions permanentes de champions restent à **400 Éclats**. Le roster Daily commun et l’absence de wallet serveur invité sont conservés.

## Inventaire des coûts

Les coûts ne sont pas modifiés. Chaque rang coûte le prix déclaré du nœud ; chaque parent historique exige le rang 1. Le rapport d’audit détaille le coût minimal des ancêtres partagés et du rang cible maximal. Il distingue le total théorique, qui inclut des effets désactivés, de la somme des rangs supportés.

| Rôle | Tous les rangs du catalogue historique | Rangs supportés et atteignables |
| --- | ---: | ---: |
| Assassin | 930 | 650 |
| Combattant | 930 | 650 |
| Mage | 930 | 780 |
| Tireur | 930 | 780 |
| Support | 980 | 500 |
| Tank | 1 080 | 750 |

Une somme théorique ne promet pas un parcours légal. Un chemin indisponible reste explicitement censuré, sans durée inventée. Les spécialisations sont ajoutées comme choix exclusifs ciblés, sans prix remplacé sur les nœuds déjà possédés ; elles restent soumises à leur validation de balance avant activation.

## Simulation reproductible et limites

`tooling/enhancements/economySimulation.ts` utilise la véritable fonction de récompense de run et sa répartition entière. Une run sans vague terminée rapporte zéro. Le budget compte est fixe pour une même progression et ne dépend pas de la taille de l’équipe ; sa répartition entre champions détermine la maîtrise. La somme des parts est contrôlée à chaque run simulée.

Le modèle emploie une seed fixe, 128 joueurs par cellule, six participants et un horizon de 52 semaines. Les six cellules croisent deux rythmes et trois difficultés. Le rythme casual suppose trois runs par semaine, le régulier dix ; la durée supposée est 35 minutes. Les probabilités de victoire sont 45/25/12 % pour le casual et 75/50/30 % pour le régulier, en facile/normal/difficile ; 5 % d’abandons immédiats sont modélisés. Une victoire supposée comporte 22 combats et six biomes ; une défaite comprend une à vingt vagues, avec progression de biome bornée.

**Ces valeurs décrivent des scénarios synthétiques et non des joueurs observés.** Les heures et semaines sont des conversions d’hypothèses, jamais des mesures réelles. La difficulté modifie la probabilité de progression du modèle : aucune prime de difficulté fictive n’est ajoutée à la formule de récompense. Les résultats publient les effectifs, p10/médiane/p90, minimum, maximum et joueurs n’atteignant pas l’objectif dans l’horizon.

Chaque objectif est un scénario d’épargne indépendant. Le même solde ne finance pas simultanément tous les objectifs du tableau. L’accès exige aussi la maîtrise réellement accumulée : un gros solde de compte ne remplace pas une maîtrise manquante. Cette séparation explique que, dans les hypothèses retenues, des objectifs de maîtrise 3 demandent une médiane d’environ 18–22 semaines casual ou 4,6–5,9 semaines régulier. Il ne s’agit pas d’une prévision de rétention.

Le scénario défavorable sans récompense est testé : zéro recette, aucun objectif payant atteint, durée inconnue. Les entrées non finies, populations non bornées, doublons d’objectifs et prix négatifs sont refusés. Le rapport est déterministe ; il ne lit ni ne modifie aucun compte.

## Décision de reset

La politique livrée est **gratuite dès le premier reset et pour les suivants**, sur les dépenses attestées uniquement. Elle restitue exactement le montant payé que le serveur peut réconcilier. La proposition historique « premier gratuit puis 10 % » reste une alternative analytique, pas un tarif adopté.

Une retenue de 10 % sur les rangs supportés ferait perdre 50 à 78 Candies par reset complet. En l’absence de preuve humaine justifiant ce coût, aucune taxe n’est activée. Les prix des nœuds historiques restent identiques. Une future politique payante ou un changement de prix doit publier cohortes, variance, scénarios défavorables et playtests humains avant activation.

Le comparateur de frais effectue une division entière explicite ; remboursement plus frais égale toujours la dépense attestée. Le remboursement ne dépend jamais d’un prix client ou d’un total de sauvegarde non vérifié. Les anciens achats dont la dépense ne peut pas être attestée restent conservés avec un état d’historique insuffisant, sans création de Candies. Les snapshots de runs déjà commencées restent figés.

## Preuves

Les tests `enhancementEconomySimulation.test.ts` couvrent budget fixe, répartition par taille d’équipe, maîtrise, blocages, abandon immédiat, déterminisme, valeurs invalides, arrondis et inventaire des six arbres. Les résultats sont intégrés à l’audit généré, dont les sources sont empreintées. Les mesures de combat et la validation humaine des spécialisations complètent cette analyse ; une simulation de récompense ne valide pas leur équilibre.
