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
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Définir `AiPolicy`, `AiContext` et `AiDecision` : acteur, équipe, adversaires, options légales, détails de score et raison, version de politique.
  - [ ] Documenter l'API du point d'entrée existant `selectContextualBattleAction` et prévoir un adaptateur sans casser ses consommateurs.
  - [ ] Définir la forme sérialisable des champs AiContext/AiDecision et la politique de version.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Documenter le comportement lorsque les choix légaux sont vides : aucune action inventée.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester champs absents, politique inconnue et équivalence des anciens appels au sélecteur.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-002 — Inventaire des mécaniques réellement supportées
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Tester types `damage/heal/shield/cc/buff/debuff/dot/hot/execute/delayed_damage`, coûts, cibles, restrictions et timing réellement acceptés.
  - [ ] Relever les Q/W/E/R/passifs réellement pris en charge par le catalogue courant, sans extrapoler du LoL live.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Cartographier les 11 champions maintenus avec sorts Q/W/E/R/passif et effets concrets ; signaler les outils non implémentés.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester les types damage, heal, shield, CC, DoT et effets conditionnels non implémentés.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-003 — Source de vérité des options légales
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Construire uniquement à partir des `BattleActionOption` produites par le moteur/validateur, jamais depuis des suppositions de l'UI.
  - [ ] Utiliser les BattleActionOption canoniques comme unique ensemble de choix possibles et leurs IDs cibles.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Exclure cible morte/allié ennemi/ressource ou cooldown insuffisant et ne jamais convertir un sort invalide en action silencieuse.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester cooldown, stun, ressource épuisée, cible morte et action forgée.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-004 — Compatibilité du bot existant
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Encapsuler la politique `legacy` à comportement strictement identique, pour rollback et replays antérieurs.
  - [ ] Figer un jeu de décisions de référence avec les seuils et l'ordre de priorité de legacy.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Ajouter fixtures golden sur mêmes actions/cibles, tie-break et résultats pour un panel de combats existants.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Comparer actions, cibles et tie-breaks octet par octet avant/après extraction.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-005 — Validation défensive des choix
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Revalider l'action choisie avec le même validateur avant exécution ; fournir un fallback légal (attaque de base si disponible, sinon absence d'action documentée).
  - [ ] Définir quoi faire lorsque la validation finale rejette la sélection entre décision et exécution.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Journaliser uniquement en développement le motif des rejets, sans données utilisateur sensibles.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester cible devenue invalide, attaque de secours et aucune action légale.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-006 — Contrats de performances initiaux
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Mesurer coût de `legacy` sur petits/grands combats et fixer un protocole P50/P95 sous Node 24 et navigateur mobile simulé.
  - [ ] Définir scènes 1v1/5v5, nombre d'itérations, profils navigateur/Node et métriques P50/P95.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Conserver une référence avant refactor : décisions, temps, taille de bundle, mémoire.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Mesurer coût de décision et allocations sans inclure chargement des assets.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.
**Gate S1 :** contrat commun, décisions anciennes inchangées, zéro action illégale sur les fixtures.

## Sprint AI-S2 — Évaluer les actions au lieu de priorités fixes (P1 ; AI-007..012)

### AI-007 — Score explicable
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Implémenter une fonction pure de score de candidat : `S(a) = D + H + C + K + Y − M − R` (dégâts, soin, contrôle, élimination, synergies, coût d'opportunité ressources, risque).
  - [ ] Documenter unités, normalisation et ordre des termes D/H/C/K/Y/M/R du score.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Normaliser les composantes sur des unités comparables ; exposer les pondérations versionnées et un objet d'explication.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester deux actions équivalentes, NaN, valeurs extrêmes et raisons de score.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-008 — Prédiction de dégâts réaliste
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Estimer HP/bouclier réellement perdus à partir des règles de `CombatRuleRuntime` (armure/RM, résistances, crit et effets supportés).
  - [ ] Exposer estimation non mutante des dégâts avec armure, RM, shields et réductions réellement appliquées.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Éviter de compter deux fois DoT, dégâts différés, multiplicateurs ou cibles de zone.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester physique/magique/vrai, bouclier partiel, résistances et effets différés.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-009 — Soins/boucliers utiles
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Évaluer PV réellement récupérables, overheal, shield déjà présent, dégâts plausibles à venir et urgence de l'allié.
  - [ ] Distinguer soin brut, soin effectif, overheal, shield existant et menace immédiate.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Ne pas consommer de soin sur allié full HP sans avantage tactique prouvé.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester allié full HP, critique, mort, heal de groupe et shield inutile.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-010 — Contrôle et fenêtres tactiques
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Pondérer les tours/actions adverses réellement supprimés, la résistance/immunité et la durée du CC.
  - [ ] Définir valeur du CC selon action ennemie réellement empêchée, durée et immunité.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Pénaliser l'empilement inutile de CC et préserver les actions non contrôlables.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester stun redondant, immunité, durée 0 et ennemi déjà neutralisé.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-011 — Kill/execute et risque d'overkill
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Mesurer probabilité déterministe d'élimination avec règles exactes, exécution sur seuil réel et ordre des effets.
  - [ ] Évaluer une élimination après défense et bouclier, et le coût d'un ultime surdimensionné.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Favoriser l'élimination sûre sans gaspiller un ultime de façon disproportionnée ; expliciter l'objectif du joueur/bot.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester execute au seuil, overkill, cible à 1 HP et protection active.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-012 — Coûts, cooldowns et égalités
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Valoriser mana/ressource restante, cooldown et valeur future estimée ; garder attaques de base viables.
  - [ ] Définir ordre de tie-break sans hasard : score, coût, type/slot, ID cible stable.
  - [ ] Lire le coût depuis la règle canonique et préparer Mana/Fury/Energy/None par J.1, jamais depuis action.cost.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Cas limites : NaN, statistiques nulles, équipes vides, ciblage impossible ; tests fuzz.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester coût gratuit, variable et impossible, départ 0/1/max ressource.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.
**Gate S2 :** aucune action rejetée ; scoring interprétable et stable ; comparatifs contre `legacy` publiés, sans promesse de win-rate avant playtests.

## Sprint AI-S3 — Profils selon les 11 champions (P1 ; AI-013..018)

Chaque profil est une **configuration de préférences**, pas un moteur de sort distinct. Il prend en compte le kit réellement chargé (versions de catalogue) et s'ajuste au contexte.

### AI-013 — Garen et Darius : frontline/finisher
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Garen : privilégier protection si menacé, dégâts sûrs puis exécution si le seuil légal est atteint ; éviter de gaspiller un sort défensif hors danger.
  - [ ] Darius : exploiter les effets cumulables effectivement implémentés et terminer une cible vulnérable ; ne pas supposer mécaniques LoL non codées.
  - [ ] Adapter les profils Garen/Darius à leurs sorts disponibles et aux cibles pertinentes.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Scénarios testés contre backline, tank ennemi et cible agonisante.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester tank ennemi, cible exécutable, santé faible et adversaire isolé.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-014 — Warwick et Malphite : survie et engage
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Warwick : ajuster agressivité selon PV propres, récupération effective et valeur d'exécution.
  - [ ] Malphite : valoriser réduction de dégâts/AoE/CC lorsque plusieurs adversaires peuvent être affectés, sans notion de distance spatiale.
  - [ ] Décrire les critères de survie Warwick et d'engage/contrôle Malphite sans positions fictives.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Tester combat prolongé et menace d'élimination au prochain tour.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester PV faibles, AoE à une cible et CC sur menace prioritaire.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-015 — Leona et Soraka : contrôle et soutien
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Leona : donner priorité au contrôle d'une menace active puis à la protection de l'équipe, pas au spam d'attaque sans utilité.
  - [ ] Soraka : optimiser les soins effectifs et la survie de l'allié le plus menacé ; préserver les ressources et respecter le ciblage.
  - [ ] Comparer soin Soraka et contrôle/protection Leona selon urgence effective de la cible.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Empêcher soin inutile ou CC répété sans bénéfice.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester allié critique, protection inutile, CC déjà présent et cibles mortes.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-016 — Annie et Lux : burst et contrôle
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Annie : ordonner burst et application de contrôle selon disponibilité réelle des passifs/sorts.
  - [ ] Lux : optimiser dégâts/contrôle/bouclier réellement supportés selon composition ; limiter l'overkill.
  - [ ] Choisir burst/contrôle Annie-Lux selon passif, sort disponible et nombre de cibles réelles.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Comparer choix d'ultimate face à boss versus vagues normales.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester boss, vague multi-ennemis, shield allié et ultimate sur overkill.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-017 — Veigar : progression intra-run réelle
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Utiliser ses stacks `runProgress` et son AP autoritaire pour estimer les dégâts ; **ne pas donner de stacks à l'IA sans kill réel**.
  - [ ] Respecter +1 kill normal via sort / +3 élite / +10 boss, avec plafonds/règles exacts du contrat `P3-CHAMP-01` ; ne pas inventer de récompense sur touche/assist.
  - [ ] Utiliser les stacks Veigar confirmés dans runProgress sans attribution avant l'élimination.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Tester run précoce, Veigar avancé, fin de combat et restauration/replay v22.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester 0/max stacks, kill élite/boss, reload et parité ancien moteur.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-018 — Ashe et Jinx : DPS soutenu
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Ashe : privilégier la meilleure cible et le contrôle préventif quand le kit l'autorise ; préserver ressources/cooldowns.
  - [ ] Jinx : arbitrer mono/multi-cible et finisher selon HP/bouclier/nombre d'ennemis, sans snowball irréaliste.
  - [ ] Comparer DPS continu Ashe et finisher/AoE Jinx avec le coût d'opportunité réel.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Mesurer efficacité en combat court et long.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester une cible, trois cibles, low mana et cible protégée.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.
**Gate S3 :** les 11 profils documentés, tests explicables et aucune règle cosmétique inventée. Futurs Renekton/Katarina/Heimerdinger/Kayn/Sylas ajoutés dans leurs propres sprints `P3-CHAMP-02..06` après création de leurs mécaniques.

## Sprint AI-S4 — Ciblage et coordination d'équipe (P1 ; AI-019..024)

### AI-019 — Menace et valeur de cible
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Évaluer dégâts futurs/soins/CC possibles selon options réellement exposées et PV effectifs, sans tricherie sur RNG futur.
  - [ ] Définir menace visible, santé effective et utilité de soigneur plutôt que HP seul.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Prioriser cible dangereuse ou éliminable en fonction des objectifs, pas systématiquement « PV le plus bas ».
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester support dangereux, tank blessé et tie-break cible.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-020 — Focus d'équipe
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Construire une préférence commune de cible à partir de l'état courant sans partage de mémoire cachée entre instances.
  - [ ] Calculer focus d'équipe sans stocker d'informations cachées entre les tours.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Vérifier qu'un focus n'empêche pas soins, protections ou opportunités de multi-kill.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester mort de cible, heal urgent et absence de cible commune légale.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-021 — Synergies entre champions
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Favoriser contrôle + burst, réduction de défense + dégâts, soin + frontline, finisher + dégâts préalables uniquement quand effets jouables.
  - [ ] Lister synergies réellement résolues, sans ajouter de multiplicateurs côté IA.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Tester combinaisons Garen/Leona/Soraka, Malphite/Annie, Ashe/Jinx, Veigar/Lux.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester buff expiré, CC actif, composition sans synergie et burst combiné.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-022 — AoE et multi-cible
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Calculer la valeur des cibles réellement touchées, priorités de CC, coût de mana et overkill ; ne pas supposer une grille spatiale.
  - [ ] Évaluer AoE selon cibles réellement touchées sans exiger artificiellement deux ennemis.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Cas une seule cible, ennemis invulnérables et cibles à très faible PV.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester AoE mono-cible, cibles immunisées, overkill et coût élevé.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-023 — Préserver les alliés clés
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Définir valeur contextuelle d'une unité menacée sans sacrifier systématiquement les autres.
  - [ ] Estimer risque de mort alliée seulement avec initiative/effets observables.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Comparer soin, shield, contrôle offensif et kill préventif dans les mêmes unités de décision.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Comparer soin/shield/contrôle/kill préventif pour un carry à 1 HP.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-024 — Initiative et tours suivants
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Utiliser seulement les informations déterministes visibles sur la queue de tours, statut CC et cooldown ; ignorer les futurs jets inconnus.
  - [ ] Utiliser l'ordre des tours visible et réévaluer après chaque résolution réelle.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Tester décisions avant/après ralentissement, stun, mort et changement de cible.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester stun, mort, ralentissement et changement de file.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.
**Gate S4 :** décisions sensibles à l'équipe/ennemis, replays stables, aucune information cachée exploitée.

## Sprint AI-S5 — Adaptation aux builds et aux difficultés (P1/P2 ; AI-025..029)

### AI-025 — Runes, objets, augments et bonus Candies
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Lire les effets déjà appliqués et les règles effectives, sans réimplémenter leurs multiplicateurs dans l'IA.
  - [ ] Lire les bonus réels du runtime et préparer les ressources canoniques prévues par J.1.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Vérifier que deux builds du même champion peuvent produire des décisions différentes et explicables.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester deux builds, runes divergentes, Candies achetées et bonus fictif absent.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-026 — HP/MP, attrition et combat long
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Ajuster conservation de ressources selon mana restant, alliés, réserve de soins et durée plausible du combat.
  - [ ] Prévoir conservation de ressources de manière générique type/current/max/gain/spend après J.1.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Éviter « ne jamais lancer de sorts » comme « tout dépenser immédiatement ».
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester Mana/Fury/Energy/None, coût conditionnel et long combat sans ressource.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-027 — Difficulté Easy/Normal/Hard
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Documenter si difficulté influe réellement sur la politique ; ne jamais modifier arbitrairement la difficulté du Daily officiel.
  - [ ] Fixer le contrat difficulté ↔ politique sans changer secrètement l'équité du Daily.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Tester mêmes inputs/version → mêmes décisions, même si un poids de difficulté est paramétré.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Comparer mêmes seeds en Easy/Normal/Hard et mode Daily verrouillé.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-028 — Elites et boss
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Définir prudence sur cooldowns, protection des alliés et stratégie mono-cible adaptée aux règles boss.
  - [ ] Évaluer les contraintes boss/élite seulement via leurs effets déclarés et disponibles.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Ne pas utiliser de connaissance cachée sur les tours/attaques futures du boss.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester boss isolé, élite escortée, cooldowns longs et manque de défense.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-029 — Modes et état de run
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Séparer une politique **intra-combat** des décisions de carte/boutique/recrutement, non couvertes par ce bot tant qu'un système explicite n'existe pas.
  - [ ] Délimiter le choix d'action intra-combat, sans réécrire navigation, shop ou recrutement.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Tester début de run, changement de biome, fin de combat, combat interrompu/repris et Daily.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester invité, connecté, Daily, changement biome et reprise.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.
**Gate S5 :** choix cohérents selon champion/build/encounter, sans modifier les récompenses ou règles de combat.

## Sprint AI-S6 — Robustesse et décisions avancées (P2 ; AI-030..034)

### AI-030 — Recherche bornée
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Évaluer si une recherche limitée d'un coup est utile ; comparer au scoring direct sur mêmes situations.
  - [ ] Définir budget en nœuds, profondeur et état cloné sans toucher à la graine de la run.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Fixer budget de nœuds, profondeur et mémoire ; pas de simulation infinie ni de consommation RNG de la partie.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester recherche bornée, état complexe et écart avec scoring direct.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-031 — Risque et incertitude
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Exprimer les dommages non garantis en espérance/borne, sans lancer de nouveaux dés à chaque évaluation.
  - [ ] Documenter espérance/borne du risque sans générer de nouveau tirage aléatoire.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Fournir stratégie déterministe si une estimation est impossible ou trop chère.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester événement certain, incertain, chance 0/100 et répétition identique.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-032 — Ordre des effets
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Test exhaustif des interactions dégâts différés, DoT/HoT, CC, bouclier, execute, revive et mort.
  - [ ] Respecter l'ordre moteur des CC, dégâts, boucliers, DOT et résurrection.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Éviter de multiplier les prévisions indépendantes incompatibles avec le runtime.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester DoT létal, shield absorbé, revive et effet retardé.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-033 — Situations extrêmes
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Tester 1v5, 5v1, équipes à 1 HP, mana nul, plusieurs invocations futures, sorts sans cible, contenus manquants.
  - [ ] Borner taille/temps du graphe de décision avec fallback déterministe.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Garder un comportement borné, sans crash, NaN ni boucle.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester équipes vides, 1v5, NaN, 0 Mana, summons futurs et aucun ciblage.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-034 — Profil neutre pour les futurs champions
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Ajouter fallback sur propriétés/effets du kit pour tout champion sans profil explicite.
  - [ ] Évaluer un champion sans profil depuis les effets du kit, sans heuristique de nom.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Couvrir les mécanismes futurs de Fury, cooldown reset, summons et formes seulement **après** livraison de leurs contrats sous `P3-CHAMP-02..06`.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester profil absent, ressource inconnue, formes futures et catalogues historiques.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.
**Gate S6 :** politique stable sur cas extrêmes, pas de dépendance à une liste figée de champions.

## Sprint AI-S7 — Manuel, autoplay, Edge et versioning (P1 ; AI-035..039)

### AI-035 — Point d'intégration unique
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Brancher la politique sur `BattleManager` et le flux existant `selectContextualBattleAction` sans dupliquer `BattleActionValidator`.
  - [ ] Identifier l'unique point entre choix, validation et résolution dans BattleManager.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Distinguer uniquement la sélection de l'action de la résolution de ses effets.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester paiement unique du coût et action identique manuel/autoplay.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-036 — UX autoplay
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Afficher de façon accessible la décision actuelle, sa cible et une explication concise en mode observation si activée.
  - [ ] Fournir une explication accessible de l'action observée en réutilisant le contrôleur d'ARCH-13.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Préserver vitesses ×1/×2/×3, mode manuel, pause, focus et accessibilité ; ne pas créer une seconde machine à tours React.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester pause, ×1/×2/×3, lecteur d'écran et cible changée.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-037 — Traces replay déterministes
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Sérialiser les paramètres de politique si nécessaires au replay/versionnement et garder les tie-break identiques.
  - [ ] Versionner les paramètres influant sur la sélection pour maintenir les anciens replays.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Comparer scénarios même seed/état/roster/items/équipements : client local, Edge et relecture.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Comparer traces et hashes après sérialisation, reload et tie-break.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-038 — Évolution authority contrôlée
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Ne pas changer les bundles v22 et historiques ; préparer registre/version/capacités/content hash/migration et nouveau bundle *uniquement si le comportement autoritaire change*.
  - [ ] Cible envisagée `run-engine-v23` après validation de disponibilité ; conserver anciens attempts `replay-only` selon politique.
  - [ ] Établir si la nouvelle politique nécessite vraiment une nouvelle version authority, sans modifier v22.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Tests de hash, migration append-only, tests schema/RLS et baselines avant déploiement.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester registres, hash, anciens attempts et bundle replay-only.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-039 — Rollback et modes invité/connecté
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Flag `tactical-v1` sur `dev`, retour `legacy` immédiat sans changer les runs déjà émis ; journaliser version choisie.
  - [ ] Spécifier quand le flag tactical-v1 est figé pour une run déjà démarrée.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Mode invité et connecté : ne pas ouvrir de voie pour simuler une récompense hors authority ; Daily déterministe inchangé.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester invité, connecté, OFF/ON, tentative en cours et rollback legacy.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.
**Gate S7 :** aucune différence de replay autoritaire et aucun changement du mode manuel ; version future compatible.

## Sprint AI-S8 — Batteries de tests et mesures (P1/P2 ; AI-040..044)

### AI-040 — Tests unitaires par décision
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Ajouter cas représentatifs pour les 11 profils, actions possibles, coûts, CC, soins, ciblage, AoE, tie-break et stats bornées.
  - [ ] Générer des fixtures de sélection couvrant les 11 profils et les choix invalides.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Tester le même contexte 100 fois pour confirmer une décision identique.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester répétition 100 fois, coûts limites, CC et cibles équivalentes.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-041 — Tests de parité/intégration
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Tester manuel/auto/autorité sur traces mêmes commandes, seeds et états ; inclure freeze des anciennes versions.
  - [ ] Définir mêmes contextes et seeds pour manuel, auto et Edge, avec versions explicites.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Vérifier 0 action illégale et 0 divergence dans la matrice déterministe de référence.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Comparer ordre RNG, commandes exactes et refus d'une action falsifiée.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-042 — Tournois comparatifs contrôlés
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Construire lots appariés mêmes seeds/rosters/builds/difficultés : `legacy` vs `tactical-v1`.
  - [ ] Comparer legacy et tactical sur lots appariés avec version/seed/difficulté constants.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Mesurer victoire, durée, mana gaspillé, overheal, contrôle effectif, overkill et survie ; publier effectifs/intervalles, pas de victoire proclamée sans preuve.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Publier effectifs, win-rate, sursoin, overkill et intervalles incertitude.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-043 — Budgets de latence
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Mesurer P50/P95 sur machines représentatives, notamment mobile ; cible provisoire **P95 < 20 ms par décision**, à confirmer avec profilage réel.
  - [ ] Fixer protocole benchmark P50/P95 reproductible et budgets représentatifs mobile.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Éviter ralentissement d'UI, freeze de tour ou allocation incontrôlée ; seuil CI reproductible et avertissement sur l'environnement de mesure.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester 1v1, 5v5, plusieurs buffs et éventuel dépassement des 20 ms visés.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-044 — Non-régressions du jeu
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Vérifier multi-biomes, sauvegarde/reload, replays, Daily, économie de Candies/Éclats et versions moteur.
  - [ ] Définir parcours de non-régression hors IA : save/reload, Daily, économie et replays.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Ajouter E2E observateur/autoplay; maintenir couverture et benchmark reproductible.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester rerun avec même seed, mode connecté et replay historique.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.
**Gate S8 :** aucune décision invalide/divergence sur échantillons versionnés ; métriques comparatives et budget disponibles.

## Sprint AI-S9 — Déploiement et maintien (P2 ; AI-045..049)

### AI-045 — Activation progressive sur LolRogueDev
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Publier sur branche `dev` + Supabase LolRogueDev/preview uniquement après gates, avec version/flag contrôlés.
  - [ ] Garder une activation sur dev avec vérification du couple client/Edge avant flag ON.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Observer rejets authority, sauvegardes, traces et erreurs ; ne pas activer implicitement sur production.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester mauvaise cible, ancien attempt et état OFF en production.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-046 — Observabilité minimale
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Agréger taux de fallback/erreurs d'actions, temps de décision, statistiques d'efficacité et version de politique.
  - [ ] Définir métriques agrégées respectant opt-in/rétention et sans données privées.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Ne pas enregistrer de traces sensibles ni d'identité joueur en clair ; respecter opt-in/retention déjà configurés.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester télémétrie coupée, erreur d'envoi et absence de secret dans l'event.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-047 — Calibration avec playtests
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Comparer simulations aux playtests humains `P2-BAL-01` ; différencier un bot « meilleur » d'un jeu globalement plus facile.
  - [ ] Calibrer l'évaluation humaine en séparant compétence du joueur et force du bot.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Valider l'équilibre par difficulté, boss, composition et niveau de joueurs avant retoucher les paramètres.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Comparer groupes, tailles d'échantillon et intervalles sans conclure sur N trop faible.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-048 — Rollout production et retour arrière
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Formaliser canary/flag, compatibilité attempts en vol, procédure rollback, vérifications post-release et contrôle des métriques.
  - [ ] Définir seuils de rollback, stabilité des attempts en vol et ordre de promotion.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Vérifier les droits et cibles : aucune PR feature ne déploie en production.
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester feature flag réversible, nouvelle run et ancienne run historique.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.

### AI-049 — Documentation et extension future
- [ ] **Définir précisément la décision ou le contrat attendu.**
  - [ ] Documenter interfaces `AiPolicy/AiDecision`, pondérations, profils, comparatifs et comment ajouter un champion sans réécrire le bot.
  - [ ] Mettre à jour README/docs/tests et archiver uniquement les tâches validées avec preuves.
  - [ ] Documenter version policy, profil champion par effet et intégration J.1/Fury sans nouvelle formule ad hoc.
  - [ ] Identifier les données observables et distinguer responsabilités IA, validation et résolution des effets.
- [ ] **Implémenter sans dupliquer les règles de jeu.**
  - [ ] Définir responsabilité `AI` (choix d'action) vs `P3-CHAMP` (mécaniques) vs `TREE` (améliorations).
  - [ ] Prévoir ressources/coûts canoniques, effets indisponibles et retour sûr si aucune action légale.
  - [ ] Conserver un tie-break déterministe et ne pas modifier les bundles des anciennes versions.
- [ ] **Tester les cas nominaux et les échecs.**
  - [ ] Tester qu'un champion sans profil garde un comportement légal et déterministe.
  - [ ] Tester à état et seed identiques, documenter la version de politique et enregistrer une preuve dans la PR.
  - [ ] Vérifier absence d'action illégale, absence de mutation lors du scoring et stabilité replay/client/authority quand applicable.
**Gate générale :** 49 tâches revues ; 0 action illégale ou divergence parité sur batterie déterministe, 100 % reproductible, P95 < 20 ms visé et mesuré, flag/rollback/versioning démontrés ; aucun faux bonus ou mécanique hors jeu.
