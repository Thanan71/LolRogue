# AI — Bot stratégique tactique de LolRogue

**Statut : proposé, aucune tâche ci-dessous n'est déclarée livrée.** 9 sprints, **49 tâches** (`AI-001` à `AI-049`). [Retour au TODO](../../TODO.md) · [Architecture](architecture-maintenance.md).

## Contrat et risques

Le moteur existant `src/game/battle/contextualBattleAi.ts` est **déjà déterministe** avec priorités simples (exécution > protection/soin > AoE > sort offensif > buff > attaque) et les options autorisées par `BattleActionValidator`. Il faut **l'améliorer, pas introduire un deuxième système de résolution des sorts**. `BattleManager`, `CombatRuleRuntime` et `AuthorityRunEngine` restent les sources de règles.

- [ ] Politique explicite `legacy` (comportement actuel) versus `tactical-v1` (nouvelle stratégie) ; flag limité à l'expérimentation `dev` tant que parité et nouveau contrat authority absents.
- [ ] Proposer `src/game/battle/ai/{types,candidates,evaluation,targeting,roles,policy}.ts` ; composants/UI ne doivent pas être requis pour calculer les décisions.
- [ ] Les décisions sont pures et reproductibles à état/seed/versions identiques ; tie-break stable par IDs ; aucun appel réseau, heure système ou `Math.random` implicite.
- [ ] Ne jamais inventer position, portée spatiale, broussailles, terrain, déplacement, furtivité ou zone non prise en charge par le combat au tour par tour.
- [ ] Les replays v1..v22/bundles historiques sont immuables : si l'autoplay vérifié change sémantiquement, publier une **nouvelle version authority** après tests (cible proposée `run-engine-v23`, uniquement si toujours libre).
- [ ] Maintenir mode manuel, mode invité, Daily, modes connectés, combats contre IA ennemie et autoplay ; ne pas donner au bot la connaissance d'informations cachées au joueur.

## Sprint AI-S1 — Sécuriser le moteur de décision (P1 ; AI-001..006)

### AI-001 — Contrat de politique
- [ ] Définir `AiPolicy`, `AiContext` et `AiDecision` : acteur, équipe, adversaires, options légales, détails de score et raison, version de politique.
- [ ] Documenter l'API du point d'entrée existant `selectContextualBattleAction` et prévoir un adaptateur sans casser ses consommateurs.
- [ ] Documenter le comportement lorsque les choix légaux sont vides : aucune action inventée.

### AI-002 — Inventaire des mécaniques réellement supportées
- [ ] Tester types `damage/heal/shield/cc/buff/debuff/dot/hot/execute/delayed_damage`, coûts, cibles, restrictions et timing réellement acceptés.
- [ ] Cartographier les 11 champions maintenus avec sorts Q/W/E/R/passif et effets concrets ; signaler les outils non implémentés.

### AI-003 — Source de vérité des options légales
- [ ] Construire uniquement à partir des `BattleActionOption` produites par le moteur/validateur, jamais depuis des suppositions de l'UI.
- [ ] Exclure cible morte/allié ennemi/ressource ou cooldown insuffisant et ne jamais convertir un sort invalide en action silencieuse.

### AI-004 — Compatibilité du bot existant
- [ ] Encapsuler la politique `legacy` à comportement strictement identique, pour rollback et replays antérieurs.
- [ ] Ajouter fixtures golden sur mêmes actions/cibles, tie-break et résultats pour un panel de combats existants.

### AI-005 — Validation défensive des choix
- [ ] Revalider l'action choisie avec le même validateur avant exécution ; fournir un fallback légal (attaque de base si disponible, sinon absence d'action documentée).
- [ ] Journaliser uniquement en développement le motif des rejets, sans données utilisateur sensibles.

### AI-006 — Contrats de performances initiaux
- [ ] Mesurer coût de `legacy` sur petits/grands combats et fixer un protocole P50/P95 sous Node 24 et navigateur mobile simulé.
- [ ] Conserver une référence avant refactor : décisions, temps, taille de bundle, mémoire.

**Gate S1 :** contrat commun, décisions anciennes inchangées, zéro action illégale sur les fixtures.

## Sprint AI-S2 — Évaluer les actions au lieu de priorités fixes (P1 ; AI-007..012)

### AI-007 — Score explicable
- [ ] Implémenter une fonction pure de score de candidat : `S(a) = D + H + C + K + Y − M − R` (dégâts, soin, contrôle, élimination, synergies, coût d'opportunité ressources, risque).
- [ ] Normaliser les composantes sur des unités comparables ; exposer les pondérations versionnées et un objet d'explication.

### AI-008 — Prédiction de dégâts réaliste
- [ ] Estimer HP/bouclier réellement perdus à partir des règles de `CombatRuleRuntime` (armure/RM, résistances, crit et effets supportés).
- [ ] Éviter de compter deux fois DoT, dégâts différés, multiplicateurs ou cibles de zone.

### AI-009 — Soins/boucliers utiles
- [ ] Évaluer PV réellement récupérables, overheal, shield déjà présent, dégâts plausibles à venir et urgence de l'allié.
- [ ] Ne pas consommer de soin sur allié full HP sans avantage tactique prouvé.

### AI-010 — Contrôle et fenêtres tactiques
- [ ] Pondérer les tours/actions adverses réellement supprimés, la résistance/immunité et la durée du CC.
- [ ] Pénaliser l'empilement inutile de CC et préserver les actions non contrôlables.

### AI-011 — Kill/execute et risque d'overkill
- [ ] Mesurer probabilité déterministe d'élimination avec règles exactes, exécution sur seuil réel et ordre des effets.
- [ ] Favoriser l'élimination sûre sans gaspiller un ultime de façon disproportionnée ; expliciter l'objectif du joueur/bot.

### AI-012 — Coûts, cooldowns et égalités
- [ ] Valoriser mana/ressource restante, cooldown et valeur future estimée ; garder attaques de base viables.
- [ ] Définir ordre de tie-break sans hasard : score, coût, type/slot, ID cible stable.
- [ ] Cas limites : NaN, statistiques nulles, équipes vides, ciblage impossible ; tests fuzz.

**Gate S2 :** aucune action rejetée ; scoring interprétable et stable ; comparatifs contre `legacy` publiés, sans promesse de win-rate avant playtests.

## Sprint AI-S3 — Profils selon les 11 champions (P1 ; AI-013..018)

Chaque profil est une **configuration de préférences**, pas un moteur de sort distinct. Il prend en compte le kit réellement chargé (versions de catalogue) et s'ajuste au contexte.

### AI-013 — Garen et Darius : frontline/finisher
- [ ] Garen : privilégier protection si menacé, dégâts sûrs puis exécution si le seuil légal est atteint ; éviter de gaspiller un sort défensif hors danger.
- [ ] Darius : exploiter les effets cumulables effectivement implémentés et terminer une cible vulnérable ; ne pas supposer mécaniques LoL non codées.
- [ ] Scénarios testés contre backline, tank ennemi et cible agonisante.

### AI-014 — Warwick et Malphite : survie et engage
- [ ] Warwick : ajuster agressivité selon PV propres, récupération effective et valeur d'exécution.
- [ ] Malphite : valoriser réduction de dégâts/AoE/CC lorsque plusieurs adversaires peuvent être affectés, sans notion de distance spatiale.
- [ ] Tester combat prolongé et menace d'élimination au prochain tour.

### AI-015 — Leona et Soraka : contrôle et soutien
- [ ] Leona : donner priorité au contrôle d'une menace active puis à la protection de l'équipe, pas au spam d'attaque sans utilité.
- [ ] Soraka : optimiser les soins effectifs et la survie de l'allié le plus menacé ; préserver les ressources et respecter le ciblage.
- [ ] Empêcher soin inutile ou CC répété sans bénéfice.

### AI-016 — Annie et Lux : burst et contrôle
- [ ] Annie : ordonner burst et application de contrôle selon disponibilité réelle des passifs/sorts.
- [ ] Lux : optimiser dégâts/contrôle/bouclier réellement supportés selon composition ; limiter l'overkill.
- [ ] Comparer choix d'ultimate face à boss versus vagues normales.

### AI-017 — Veigar : progression intra-run réelle
- [ ] Utiliser ses stacks `runProgress` et son AP autoritaire pour estimer les dégâts ; **ne pas donner de stacks à l'IA sans kill réel**.
- [ ] Respecter +1 kill normal via sort / +3 élite / +10 boss, avec plafonds/règles exacts du contrat `P3-CHAMP-01` ; ne pas inventer de récompense sur touche/assist.
- [ ] Tester run précoce, Veigar avancé, fin de combat et restauration/replay v22.

### AI-018 — Ashe et Jinx : DPS soutenu
- [ ] Ashe : privilégier la meilleure cible et le contrôle préventif quand le kit l'autorise ; préserver ressources/cooldowns.
- [ ] Jinx : arbitrer mono/multi-cible et finisher selon HP/bouclier/nombre d'ennemis, sans snowball irréaliste.
- [ ] Mesurer efficacité en combat court et long.

**Gate S3 :** les 11 profils documentés, tests explicables et aucune règle cosmétique inventée. Futurs Renekton/Katarina/Heimerdinger/Kayn/Sylas ajoutés dans leurs propres sprints `P3-CHAMP-02..06` après création de leurs mécaniques.

## Sprint AI-S4 — Ciblage et coordination d'équipe (P1 ; AI-019..024)

### AI-019 — Menace et valeur de cible
- [ ] Évaluer dégâts futurs/soins/CC possibles selon options réellement exposées et PV effectifs, sans tricherie sur RNG futur.
- [ ] Prioriser cible dangereuse ou éliminable en fonction des objectifs, pas systématiquement « PV le plus bas ».

### AI-020 — Focus d'équipe
- [ ] Construire une préférence commune de cible à partir de l'état courant sans partage de mémoire cachée entre instances.
- [ ] Vérifier qu'un focus n'empêche pas soins, protections ou opportunités de multi-kill.

### AI-021 — Synergies entre champions
- [ ] Favoriser contrôle + burst, réduction de défense + dégâts, soin + frontline, finisher + dégâts préalables uniquement quand effets jouables.
- [ ] Tester combinaisons Garen/Leona/Soraka, Malphite/Annie, Ashe/Jinx, Veigar/Lux.

### AI-022 — AoE et multi-cible
- [ ] Calculer la valeur des cibles réellement touchées, priorités de CC, coût de mana et overkill ; ne pas supposer une grille spatiale.
- [ ] Cas une seule cible, ennemis invulnérables et cibles à très faible PV.

### AI-023 — Préserver les alliés clés
- [ ] Définir valeur contextuelle d'une unité menacée sans sacrifier systématiquement les autres.
- [ ] Comparer soin, shield, contrôle offensif et kill préventif dans les mêmes unités de décision.

### AI-024 — Initiative et tours suivants
- [ ] Utiliser seulement les informations déterministes visibles sur la queue de tours, statut CC et cooldown ; ignorer les futurs jets inconnus.
- [ ] Tester décisions avant/après ralentissement, stun, mort et changement de cible.

**Gate S4 :** décisions sensibles à l'équipe/ennemis, replays stables, aucune information cachée exploitée.

## Sprint AI-S5 — Adaptation aux builds et aux difficultés (P1/P2 ; AI-025..029)

### AI-025 — Runes, objets, augments et bonus Candies
- [ ] Lire les effets déjà appliqués et les règles effectives, sans réimplémenter leurs multiplicateurs dans l'IA.
- [ ] Vérifier que deux builds du même champion peuvent produire des décisions différentes et explicables.

### AI-026 — HP/MP, attrition et combat long
- [ ] Ajuster conservation de ressources selon mana restant, alliés, réserve de soins et durée plausible du combat.
- [ ] Éviter « ne jamais lancer de sorts » comme « tout dépenser immédiatement ».

### AI-027 — Difficulté Easy/Normal/Hard
- [ ] Documenter si difficulté influe réellement sur la politique ; ne jamais modifier arbitrairement la difficulté du Daily officiel.
- [ ] Tester mêmes inputs/version → mêmes décisions, même si un poids de difficulté est paramétré.

### AI-028 — Elites et boss
- [ ] Définir prudence sur cooldowns, protection des alliés et stratégie mono-cible adaptée aux règles boss.
- [ ] Ne pas utiliser de connaissance cachée sur les tours/attaques futures du boss.

### AI-029 — Modes et état de run
- [ ] Séparer une politique **intra-combat** des décisions de carte/boutique/recrutement, non couvertes par ce bot tant qu'un système explicite n'existe pas.
- [ ] Tester début de run, changement de biome, fin de combat, combat interrompu/repris et Daily.

**Gate S5 :** choix cohérents selon champion/build/encounter, sans modifier les récompenses ou règles de combat.

## Sprint AI-S6 — Robustesse et décisions avancées (P2 ; AI-030..034)

### AI-030 — Recherche bornée
- [ ] Évaluer si une recherche limitée d'un coup est utile ; comparer au scoring direct sur mêmes situations.
- [ ] Fixer budget de nœuds, profondeur et mémoire ; pas de simulation infinie ni de consommation RNG de la partie.

### AI-031 — Risque et incertitude
- [ ] Exprimer les dommages non garantis en espérance/borne, sans lancer de nouveaux dés à chaque évaluation.
- [ ] Fournir stratégie déterministe si une estimation est impossible ou trop chère.

### AI-032 — Ordre des effets
- [ ] Test exhaustif des interactions dégâts différés, DoT/HoT, CC, bouclier, execute, revive et mort.
- [ ] Éviter de multiplier les prévisions indépendantes incompatibles avec le runtime.

### AI-033 — Situations extrêmes
- [ ] Tester 1v5, 5v1, équipes à 1 HP, mana nul, plusieurs invocations futures, sorts sans cible, contenus manquants.
- [ ] Garder un comportement borné, sans crash, NaN ni boucle.

### AI-034 — Profil neutre pour les futurs champions
- [ ] Ajouter fallback sur propriétés/effets du kit pour tout champion sans profil explicite.
- [ ] Couvrir les mécanismes futurs de Fury, cooldown reset, summons et formes seulement **après** livraison de leurs contrats sous `P3-CHAMP-02..06`.

**Gate S6 :** politique stable sur cas extrêmes, pas de dépendance à une liste figée de champions.

## Sprint AI-S7 — Manuel, autoplay, Edge et versioning (P1 ; AI-035..039)

### AI-035 — Point d'intégration unique
- [ ] Brancher la politique sur `BattleManager` et le flux existant `selectContextualBattleAction` sans dupliquer `BattleActionValidator`.
- [ ] Distinguer uniquement la sélection de l'action de la résolution de ses effets.

### AI-036 — UX autoplay
- [ ] Afficher de façon accessible la décision actuelle, sa cible et une explication concise en mode observation si activée.
- [ ] Préserver vitesses ×1/×2/×3, mode manuel, pause, focus et accessibilité ; ne pas créer une seconde machine à tours React.

### AI-037 — Traces replay déterministes
- [ ] Sérialiser les paramètres de politique si nécessaires au replay/versionnement et garder les tie-break identiques.
- [ ] Comparer scénarios même seed/état/roster/items/équipements : client local, Edge et relecture.

### AI-038 — Évolution authority contrôlée
- [ ] Ne pas changer les bundles v22 et historiques ; préparer registre/version/capacités/content hash/migration et nouveau bundle *uniquement si le comportement autoritaire change*.
- [ ] Cible envisagée `run-engine-v23` après validation de disponibilité ; conserver anciens attempts `replay-only` selon politique.
- [ ] Tests de hash, migration append-only, tests schema/RLS et baselines avant déploiement.

### AI-039 — Rollback et modes invité/connecté
- [ ] Flag `tactical-v1` sur `dev`, retour `legacy` immédiat sans changer les runs déjà émis ; journaliser version choisie.
- [ ] Mode invité et connecté : ne pas ouvrir de voie pour simuler une récompense hors authority ; Daily déterministe inchangé.

**Gate S7 :** aucune différence de replay autoritaire et aucun changement du mode manuel ; version future compatible.

## Sprint AI-S8 — Batteries de tests et mesures (P1/P2 ; AI-040..044)

### AI-040 — Tests unitaires par décision
- [ ] Ajouter cas représentatifs pour les 11 profils, actions possibles, coûts, CC, soins, ciblage, AoE, tie-break et stats bornées.
- [ ] Tester le même contexte 100 fois pour confirmer une décision identique.

### AI-041 — Tests de parité/intégration
- [ ] Tester manuel/auto/autorité sur traces mêmes commandes, seeds et états ; inclure freeze des anciennes versions.
- [ ] Vérifier 0 action illégale et 0 divergence dans la matrice déterministe de référence.

### AI-042 — Tournois comparatifs contrôlés
- [ ] Construire lots appariés mêmes seeds/rosters/builds/difficultés : `legacy` vs `tactical-v1`.
- [ ] Mesurer victoire, durée, mana gaspillé, overheal, contrôle effectif, overkill et survie ; publier effectifs/intervalles, pas de victoire proclamée sans preuve.

### AI-043 — Budgets de latence
- [ ] Mesurer P50/P95 sur machines représentatives, notamment mobile ; cible provisoire **P95 < 20 ms par décision**, à confirmer avec profilage réel.
- [ ] Éviter ralentissement d'UI, freeze de tour ou allocation incontrôlée ; seuil CI reproductible et avertissement sur l'environnement de mesure.

### AI-044 — Non-régressions du jeu
- [ ] Vérifier multi-biomes, sauvegarde/reload, replays, Daily, économie de Candies/Éclats et versions moteur.
- [ ] Ajouter E2E observateur/autoplay; maintenir couverture et benchmark reproductible.

**Gate S8 :** aucune décision invalide/divergence sur échantillons versionnés ; métriques comparatives et budget disponibles.

## Sprint AI-S9 — Déploiement et maintien (P2 ; AI-045..049)

### AI-045 — Activation progressive sur LolRogueDev
- [ ] Publier sur branche `dev` + Supabase LolRogueDev/preview uniquement après gates, avec version/flag contrôlés.
- [ ] Observer rejets authority, sauvegardes, traces et erreurs ; ne pas activer implicitement sur production.

### AI-046 — Observabilité minimale
- [ ] Agréger taux de fallback/erreurs d'actions, temps de décision, statistiques d'efficacité et version de politique.
- [ ] Ne pas enregistrer de traces sensibles ni d'identité joueur en clair ; respecter opt-in/retention déjà configurés.

### AI-047 — Calibration avec playtests
- [ ] Comparer simulations aux playtests humains `P2-BAL-01` ; différencier un bot « meilleur » d'un jeu globalement plus facile.
- [ ] Valider l'équilibre par difficulté, boss, composition et niveau de joueurs avant retoucher les paramètres.

### AI-048 — Rollout production et retour arrière
- [ ] Formaliser canary/flag, compatibilité attempts en vol, procédure rollback, vérifications post-release et contrôle des métriques.
- [ ] Vérifier les droits et cibles : aucune PR feature ne déploie en production.

### AI-049 — Documentation et extension future
- [ ] Documenter interfaces `AiPolicy/AiDecision`, pondérations, profils, comparatifs et comment ajouter un champion sans réécrire le bot.
- [ ] Mettre à jour README/docs/tests et archiver uniquement les tâches validées avec preuves.
- [ ] Définir responsabilité `AI` (choix d'action) vs `P3-CHAMP` (mécaniques) vs `TREE` (améliorations).

**Gate générale :** 49 tâches revues ; 0 action illégale ou divergence parité sur batterie déterministe, 100 % reproductible, P95 < 20 ms visé et mesuré, flag/rollback/versioning démontrés ; aucun faux bonus ou mécanique hors jeu.
