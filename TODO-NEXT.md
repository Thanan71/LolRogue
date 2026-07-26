# TODO NEXT — priorités et compléments d'audit

Ce document complète `TODO.md` sans le remplacer. Il rassemble les prochains chantiers à exécuter, les décisions techniques désormais tranchées et les points à réauditer après les corrections déjà apportées le 24 juillet 2026.

## Ordre d'exécution immédiat

1. **P0-SEC-02 — Daily autoritaire** : réutiliser le pipeline `run_attempt` existant et supprimer toute confiance dans les métriques Daily envoyées par le client.
2. **P0-REL-01 — Assets reproductibles** : garantir qu'un clone vierge produit exactement les assets nécessaires au jeu.
3. **P0-SEC-04 — Logs et données publiques** : réduire les données exposées, désactiver le logging DB par défaut et durcir l'ingestion.
4. **P0-SEC-03 — Upgrade Vite/Vitest** : supprimer les vulnérabilités critiques/hautes de tooling sans casser Node 22, la couverture ni le build.
5. **Réaditer P0-RUN-01 à P0-RUN-04** : marquer ce qui a réellement été corrigé et ne conserver ouverts que les risques encore reproductibles.
6. **P1-GAME-01 — TargetResolver canonique** : centraliser ciblage et validation des actions.
7. **P1-GAME-02 — Effect engine et passifs** : connecter les effets au cycle de combat réel.
8. **P1-GAME-03 — Event bus / runes / items / augments** : faire converger toutes les mécaniques vers les mêmes règles de domaine.
9. **P1-GAME-05 — Parité client / authority** : garantir qu'une même seed et les mêmes commandes donnent exactement le même résultat.
10. **P2-TEST-01 puis P2-ARCH-01** : vrais parcours E2E avant découpage structurel des gros modules.

---

## Complément P0-SEC-02 — Daily autoritaire

### Décision d'architecture

Le Daily ne doit pas introduire un deuxième système d'autorité. Toute Daily authentifiée doit réutiliser le pipeline `run_attempt` déjà utilisé par les runs normales.

- [ ] Créer toute Daily authentifiée via `start_run_attempt` avec `mode = 'daily'`.
- [ ] Figer côté serveur la date UTC, la seed, la difficulté, le ruleset, la version du moteur et le contenu autorisé.
- [ ] Calculer le score Daily exclusivement depuis le résultat `verified` produit par le replay autoritaire.
- [ ] Supprimer toute possibilité de créditer un score à partir de `p_run_level`, `p_waves_completed`, `p_gold`, `p_item_count`, `p_won` ou d'une seed déclarée par le client.
- [ ] Associer chaque ligne `daily_runs` à son `run_attempt` vérifié et refuser toute soumission sans preuve de vérification.
- [ ] Rendre atomiques la vérification de la run, le calcul du score et l'insertion/mise à jour du classement.
- [ ] Définir explicitement la règle produit : une tentative par jour ou meilleur score, puis l'appliquer atomiquement côté serveur.
- [ ] Un abandon ou une tentative rejetée/expirée ne doit jamais produire un score classé sauf décision produit explicite.
- [ ] Tester minuit UTC, plusieurs fuseaux horaires, double soumission, retry après réponse perdue, seed falsifiée, métriques falsifiées et changement de difficulté côté client.

**Acceptation :** le navigateur ne peut fournir aucune valeur permettant d'augmenter directement son score Daily ; le classement est dérivé uniquement d'un résultat autoritaire vérifié.

---

## Réaudit P0-RUN-01 — Finalisation de run

Le constat historique sur le timeout annulé au démontage de `CombatPage` doit être réévalué : la finalisation est désormais déclenchée immédiatement via `endRun` lors de la victoire/défaite.

- [x] Ne plus dépendre d'un timeout annulable par le démontage de `CombatPage` pour démarrer la finalisation.
- [x] Vérifier que toute navigation immédiate après victoire/défaite conserve une finalisation retryable et observable.
- [x] Vérifier le comportement après refresh pendant `saving`, après perte réseau et après réponse serveur perdue.
- [x] Vérifier que `/game-over` peut restaurer un résultat durable sans dépendre uniquement du state React Router.
- [x] Confirmer qu'aucun chemin de fin ne peut récompenser deux fois ou abandonner silencieusement une sauvegarde.

**Acceptation :** le ticket P0-RUN-01 ne conserve comme cases ouvertes que des bugs encore reproductibles sur le code actuel.

---

## Réaudit P0-RUN-02 — Écrasement d'une run active

Le constat historique doit être mis à jour : `startRun` attend désormais `endRun` et annule le nouveau départ si la finalisation échoue.

- [x] Attendre le résultat de `endRun` avant de remplacer une run active.
- [x] Annuler le nouveau départ si la finalisation de la run précédente échoue.
- [x] Refuser un départ sans au moins un champion valide et filtrer les champions non implémentés.
- [x] Vérifier les doublons et contraintes de slots au niveau domaine/serveur, pas seulement dans l'UI.
- [x] Bloquer ou arbitrer explicitement les courses entre deux onglets.
- [x] Uniformiser la confirmation avant Normal, Daily, logout, changement de compte ou nouvelle run.
- [x] Centraliser les garde-routes autour d'une machine d'état unique de la run.
- [x] Tester double clic, erreur réseau, accès direct URL et changement d'identité pendant une finalisation.

**Acceptation :** le ticket reflète l'état actuel du code et ne garde pas ouverts des constats déjà corrigés.

---

## Réaudit P0-RUN-03 — Exploitation de la carte

- [x] Persister `currentNodeId`, la frontière exacte et le chemin choisi.
- [x] Refuser tout saut ou déplacement qui ne suit pas une arête sortante du nœud courant.
- [x] Consommer la frontière au choix et ne rouvrir aucune branche sœur.
- [x] Lier chaque encounter, résolution, récompense et offre de shop au nœud courant.
- [x] Persister visites, stock et offres consommées du shop, y compris après refresh.
- [x] Aligner l'entrée jouable, les sorties inter-biomes et le boss final dans le modèle et l'UI.
- [x] Prouver par tests client et replay autoritaire : pas de saut, sibling farm, replay ou double claim.

**Acceptation :** une seule chaîne continue de nœuds peut produire des récompenses, localement comme lors du replay serveur.

---

## P1-GAME-05 — Garantir la parité client / authority

### Objectif

Le client et le replay autoritaire ne doivent jamais implémenter deux variantes d'une même règle. Toute règle déterministe utilisée dans une run authentifiée doit provenir d'un module de domaine partagé ou être couverte par une preuve automatique de parité.

- [ ] Identifier toutes les règles utilisées à la fois par le gameplay visible et `AuthorityRunEngine` : combat, ciblage, effets, récompenses, carte, shop, recruit, event, treasure, augments, XP et transitions de biome.
- [ ] Extraire les règles communes dans des modules de domaine purs, sans dépendance React/Zustand/Supabase.
- [ ] Éviter toute duplication de formules ou de tables de décision entre `CombatPage`, `BattleManager`, `runStore` et `AuthorityRunEngine`.
- [ ] Ajouter des golden traces déterministes couvrant au minimum Combat, Elite, Shop, Rest, Event, Treasure, Recruit, choix d'augment et changement de biome.
- [ ] Exécuter une même seed et les mêmes commandes via le runtime utilisé par le client et via le replay autoritaire.
- [ ] Comparer exactement les PV/PM, niveaux, gold, inventaire, équipe, augments, statistiques, récompenses, nœud courant, biome et état terminal.
- [ ] Faire échouer la CI à la moindre divergence de résultat déterministe.
- [ ] Versionner toute évolution incompatible de règles avec `engine_version`/content hash afin de préserver les attempts en cours.

**Acceptation :** une trace valide produit exactement le même état canonique côté client et côté authority, et cette propriété est bloquante en CI.

---

## Complément P2-ARCH-01 — Découper les modules à risque

Les tailles indiquées dans l'audit initial doivent être réévaluées régulièrement. Les deux principaux points de concentration actuels sont `runStore.ts` et `AuthorityRunEngine.ts`, tous deux devenus des orchestrateurs très larges.

### `runStore.ts`

- [ ] Garder Zustand comme état observable/orchestrateur d'interface plutôt que comme emplacement de toutes les règles métier.
- [ ] Extraire progressivement `RunLifecycleService` : start, resume, end, abandon et recovery.
- [ ] Extraire `RunAuthorityService` : attempt, journal de commandes, synchronisation, seal, verify et recovery.
- [ ] Extraire les commandes/invariants inventaire, carte et récompenses dans des modules de domaine purs.
- [ ] Ne jamais multiplier les sources de vérité pendant le découpage : une mutation canonique par donnée.

### `AuthorityRunEngine.ts`

- [ ] Garder `AuthorityRunEngine` comme orchestrateur déterministe, pas comme second moteur indépendant.
- [ ] Extraire `RunCommandValidator` pour parsing, schéma et validation des commandes.
- [ ] Extraire les résolveurs de combat/encounter/inventaire/récompenses lorsque leur responsabilité devient autonome.
- [ ] Réutiliser les mêmes règles de domaine que le runtime client dès qu'une règle est commune.
- [ ] Conserver le versioning du moteur et le content hash comme frontière de compatibilité des replays.

**Acceptation :** les orchestrateurs deviennent lisibles et testables sans créer de divergence entre un moteur client et un moteur serveur.

---

## Règle de maintenance du backlog

- [ ] Lorsqu'un correctif important est mergé, réauditer le ticket concerné et cocher immédiatement les sous-tâches réellement prouvées.
- [ ] Remplacer les constats historiques devenus faux par une section `État actuel` au lieu de laisser un P0 ouvert pour une cause déjà corrigée.
- [ ] Ne jamais considérer une case documentaire comme preuve suffisante : la Definition of Done de `TODO.md` reste la référence.
- [ ] Garder cette liste `NEXT` à dix chantiers maximum ; déplacer un nouveau chantier dans `NEXT` uniquement lorsqu'un précédent est clôturé ou dépriorisé.
