# Contrat du module combat — ARCH-13

Le module `src/features/combat` prépare l'écran de combat, traduit les événements du moteur en affichage et coordonne les interactions du joueur. Il ne choisit pas la stratégie automatique, ne calcule pas les dégâts et ne remplace pas le validateur d'actions.

## Entrées et responsabilités

| Entrée explicite                       | Données et préconditions                                                                                                                                         | Responsabilité                                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/CombatScreen.tsx`                  | Route de combat autorisée par les gardes existantes ; stores de run, combat et réglages disponibles                                                              | Composer préparation, contrôleur et vue ; conserver le chargement CSS de la route                                                                                |
| `hooks/useCombatEncounter.ts`          | Run active, équipe et rencontre persistées, version authority, snapshots de maîtrise/améliorations, inventaire et seed                                           | Lire les stores et appeler les constructeurs canoniques des équipes, du loadout et du RNG ; transmettre les ressources sauvegardées et le callback de completion |
| `hooks/useCombatController.ts`         | `CombatControllerInput` : snapshot d'affichage, réglages, options de création du moteur, navigation et `readBattle()` ; binding moteur stable pendant le montage | Sélection d'action/cible, confirmation, autoplay, délais, raccourcis, textes d'état et mise en évidence des participants                                         |
| `hooks/useBattleManager.ts`            | `UseBattleManagerOptions` : équipes runtime et options canoniques                                                                                                | Créer un seul `BattleManager`, synchroniser les snapshots de présentation et les événements, remettre le résultat capturé au callback de completion              |
| `application/combatSelection.ts`       | Options d'action produites par le moteur et identités des combattants, camp compris                                                                              | Projeter les cibles du moteur avec `resolveBattleTargets` ; conserver uniquement ses `validTargetIds`                                                            |
| `application/combatCompletion.ts`      | Résultat du manager terminé, ressources finales, trace des actions et événements                                                                                 | Journaliser la résolution une seule fois, appliquer la progression/recompense canonique existante, finaliser et naviguer vers la bonne run                       |
| `application/legacyCombatEncounter.ts` | Version enregistrée sur l'ancienne tentative                                                                                                                     | Conserver la construction de rencontre compatible avec ses règles historiques                                                                                    |
| `presentation/combatPresenter.ts`      | Snapshots d'améliorations et définitions de catalogue                                                                                                            | Produire les descriptions localisées existantes                                                                                                                  |
| `ui/CombatView.tsx` et composants UI   | Modèle retourné par le contrôleur et snapshots immuables du combat                                                                                               | Rendre le DOM, les classes CSS, libellés, attributs ARIA, cibles et effets visuels existants                                                                     |

Le port injecté `CombatEngineBinding` expose uniquement `getAvailableActions`, `submitAction`, `processTurn` et `advanceBlockedTurn`. Le paramètre de binding de `useCombatController` appelle par défaut le hook `useBattleManager` ; les tests lui fournissent un binding déterministe. `readBattle()` relit le tour vivant au moment d'une confirmation ou d'un timer, sans que le contrôleur dépende de la lecture Zustand pour ses décisions.

## Frontières préservées

- `BattleActionValidator` reste le validateur canonique, appelé par `BattleManager` ; les options disponibles viennent du moteur. Une confirmation transmet une commande une seule fois et conserve la sélection si le moteur refuse.
- La matrice de ciblage n'est plus réécrite dans la page. L'affichage appelle `resolveBattleTargets` puis filtre avec les identifiants déjà autorisés par le moteur. Les camps distinguent deux champions identiques ; un ciblage de groupe n'invente pas de cible primaire, et une zone transmet seulement la cible primaire choisie.
- Les coûts, cooldowns, contrôles de foule, dégâts, buffs, choix automatiques, règles de progression et RNG restent dans les modules métier existants. Une cible de réanimation est présentée seulement si les options canoniques la déclarent autorisée.
- Les stratégies `AI-001` et suivantes pourront évoluer dans le moteur, sans dépendre de React ni de ce contrôleur. Le timer UI demande seulement au moteur de traiter le tour ; il ne sélectionne aucune stratégie ou action.
- Aucun second store, repository, système de persistence ou moteur n'est introduit. Les droits d'accès, snapshots authority et règles de navigation restent ceux du run et des services existants.

## Cycle de vie, erreurs et courses

Une sélection est effacée lorsque l'acteur, son camp ou le round change. La confirmation relit phase, acteur, camp et round avant soumission et reconsulte les options canoniques. Le moteur applique encore sa propre validation ; aucune commande refusée ne provoque de calcul UI de remplacement.

Les tours ennemis, auto ou sans commande légale attendent le délai existant : 1 200 / 600 / 400 ms à ×1 / ×2 / ×3. Le tour programmé est revérifié à échéance. Un tour bloqué utilise uniquement l'adaptateur canonique et ne progresse pas si une commande devient disponible entre-temps. Le countdown est arrêté à l'échéance, y compris quand le tour est périmé, puis tous les timers et raccourcis sont retirés au démontage. Un combat qui entre dans `starting` réinitialise le mode auto.

`useBattleManager` garde le délai de préparation de 2 secondes, retire son listener d'événements et son timer de démarrage au démontage, et capture les ressources dans l'instance qui vient de finir avant toute transition de route. Le callback de completion demeure indépendant du store global de présentation qui peut être remplacé.

La sauvegarde terminale continue après démontage de la route, conformément au contrat de récupération existant. `navigateFinalizedCombat` relit l'identité de run/snapshot avant d'ouvrir Game Over : une réponse tardive d'une ancienne run n'écrase pas la navigation d'une nouvelle run. La protection des réponses serveur après changement de compte reste assurée par l'orchestration et les repositories livrés dans ARCH-S3.

Une run inactive rend toujours `null` et redirige vers la sélection. Une équipe runtime vide conserve sa finalisation d'erreur existante. Les moteurs historiques ou une reprise de combat exigeant la résolution serveur gardent leur autoplay obligatoire ; aucune interaction manuelle ne contourne ce choix.

## Migration et compatibilité

Sur la base `e313c6f657d2662c9c327875463f16b40ddada20`, `CombatPage.tsx` réunissait 1 057 lignes et 39 639 octets. La façade historique tient maintenant sur une ligne ; la composition de route tient sur 14 lignes / 507 octets. La préparation tient sur 340 lignes, les décisions du contrôleur sur 501 lignes et le rendu sur 366 lignes. Les responsabilités sont séparées par des entrées explicites ; aucune copie d'implémentation ne reste aux anciens chemins.

Les imports historiques `pages/CombatPage`, `hooks/useBattleManager`, les trois fichiers `pages/combat/*` et les neuf composants `components/CombatUI/*` restent des façades de compatibilité. Le barrel historique CombatUI reste compatible ; les implémentations feature importent leurs fichiers directement. Les tests et leurs mocks ont été migrés vers les implémentations, tandis que les tests de route continuent à rendre `CombatPage` pour vérifier la façade.

Les scans i18n lisent aussi le contrôleur extrait et résolvent les façades vers les vues feature. Ils continuent à refuser les libellés bruts et les formats numériques fixes. L'extraction conserve les handlers clavier et pointeur existants, la confirmation via Space/Enter, les contrôles focusables, l'affichage des sorts indisponibles et les libellés FR/EN.

## Validation du 13 octobre 2026

- **129 tests verts dans 13 fichiers** : contrôleur injecté, completion authority, statuts/synchronisation, présentation, formats/contrats i18n, raccourcis, tooltips, progression de run et styles CSP.
- Les **28 tests du contrôleur** couvrent manuel, auto ×1/×2/×3, mode serveur/reprise, cible alliée/ennemie, zone, groupes/self, refus moteur, identité dupliquée, réanimation canonique, confirmation et timer périmés, cleanup, début d'un nouveau combat, raccourcis et effets visuels. La route ajoute une preuve de sauvegarde tardive après nouvelle run, tout en conservant la preuve de finalisation après démontage.
- **6 scénarios Chromium verts**, `e2e/combat-map-presentation.spec.ts` : combat mobile avec actions réelles, ciblage offensif malgré bonus personnel, action ennemie, champions identiques dans deux camps et états/sorts indisponibles avec grand texte à 320 et 390 px. Aucune relance nécessaire ; 43,6 s.
- Biome ciblé : aucune erreur et aucun avertissement dans le lot combat.
- Le typecheck complet ne signale aucune erreur combat. À la capture du lot, son seul échec était externe : `tests/veigarRunProgressionBalance.test.ts:50`, utilisation de `replaceAll` hors lib ES2020 ; sa correction appartient au lot moteur. Les tests `runAuthorityVersioning` requièrent également la mise à jour de la nouvelle entrée 0.2.5 dans le lot moteur.

Les tests avec binding injecté ne remplacent pas les tests du moteur ni les scénarios de run complète/rechargement. Ceux-ci restent à exécuter dans la validation globale et la CI de la PR. Les assets, seuils de bundle et déploiements sont contrôlés à ce niveau ; cette extraction n'ajoute aucun asset ni dépendance npm.
