# Cycle canonique d'un tour de combat

`BattleManager` résout chaque tour dans cet ordre :

1. **Début du tour** — le combattant courant et les effets déjà présents sont
   figés pour ce tour.
2. **Contrôles** — stun, knockup, fear et charm empêchent toute action. Silence
   interdit les sorts. Dans le modèle sans positions, snare interdit l'attaque de
   base, considérée comme l'action nécessitant un déplacement.
3. **Commande** — le moteur valide acteur, tour, rang, mana, cooldown, type de
   cible et cible avant toute mutation.
4. **Action** — les coûts sont consommés, puis l'attaque ou le sort est exécuté.
5. **Effets et passifs** — dégâts, soins, boucliers, contrôles, statistiques,
   execute, marques, stacks et passifs déclenchés sont résolus dans l'ordre de la
   définition.
6. **Mort et fin de combat** — les morts sont enregistrées immédiatement. Une
   équipe éliminée termine le combat avant les ticks périodiques.
7. **Fin du tour** — les passifs de fin de tour s'appliquent, puis seuls les
   effets présents à l'étape 1 tickent et perdent une unité de durée.
8. **Tour suivant** — les cooldowns ne diminuent qu'après le dernier combattant
   du round. L'initiative est alors reconstruite avec buffs, debuffs et slows.

## Unités

- Une durée représente un nombre entier de **tours du porteur**. Une durée en
  secondes est arrondie au tour supérieur.
- Les pourcentages acceptent une fraction (`0.30`) ou une valeur humaine (`30`) ;
  les deux signifient 30 %.
- Les seuils d'execute et les fractions de revive sont bornés entre 0 et 100 %.

Un effet appliqué pendant le tour du porteur n'est pas décrémenté immédiatement :
il reste actif pendant son prochain tour, puis ticke à la fin de celui-ci.
