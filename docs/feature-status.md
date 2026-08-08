# Matrice des fonctionnalités livrées

Cette matrice relie les capacités visibles à leur implémentation et à une preuve
automatique. `Livré` signifie que le parcours réel possède au moins un test de
comportement ; cela ne signifie pas que son équilibrage ou son exploitation sont
définitifs.

| Fonctionnalité | Implémentation de référence | Preuves principales | Statut |
| --- | --- | --- | --- |
| Auth et mode invité | `authStore`, `AuthBootstrap`, repositories Auth | `authStore.test.ts`, `auth-menu-responsive.spec.ts` | Livré |
| Démarrage et reprise de run | `runStartCoordinator`, `runStoreLifecycleSlice`, gardes de routes | `runStartValidation.test.ts`, `runReloadRecovery.test.ts`, `routeAccess.test.ts` | Livré |
| Carte à branche unique | `mapProgression`, `runStoreMapSlice`, `AuthorityRunEngine` | `mapProgression.test.ts`, `authorityRunEngine.test.ts` | Livré |
| Combat manuel et autoplay opt-in | `BattleManager`, `CombatPage`, `useBattleManager` | `combatAutoplay.test.ts`, `combatPageAuthority.test.tsx`, `six-biome-run.spec.ts` | Livré |
| Ciblage, sorts et passifs des 10 champions | `BattleActionValidator`, `BattleSpellEffectResolver`, `combatContentSupport` | `battleTargetResolver.test.ts`, `battleEffectsIntegration.test.ts`, `combatContentSupport.test.ts` | Livré pour le catalogue maintenu |
| Runes, augments, objets et améliorations | `CombatRuleRuntime`, managers et catalogues validés | `combatRules.test.ts`, `statContract.test.ts`, `inventorySystem.test.ts` | Livré pour les effets classés supportés |
| Économie et rencontres | règles pures de `game/run` et `game/map` | `runTransactions.test.ts`, `encounterRules.test.ts`, `runSharedRules.test.ts` | Livré |
| Contrat d'équilibrage | `game/balance/contentBalance`, roster et profils biome | `balanceSimulation.test.ts`, `contentBalance.test.ts` | Baseline v13 livré : cohorte scriptée et six nouveaux combats |
| Fin victoire, défaite et abandon | `runFinalization`, outbox et snapshot final | `runFinalization.test.ts`, `runSaveRecovery.test.ts`, `six-biome-run.spec.ts` | Livré |
| Progression connectée autoritaire | attempts, journal, `verify-run`, `complete_run_verification` | `authorityRunEngine.test.ts`, `verifiedRunAttempts.database.test.ts`, `clientAuthorityParity.test.ts` | Livré |
| Maîtrise et améliorations | stores dédiés et RPC atomique | `mastery.test.ts`, `enhancementStoreRecovery.test.ts`, `authoritativeDaily.database.test.ts` | Livré |
| Progression et personnalisation | slots serveur, contrat cosmétique/saison, historique comparable | `personalizationContract.test.ts`, `profileHistory.test.tsx` | Contrat livré ; cosmétiques et quêtes volontairement non activés |
| Daily officiel et classement public réduit | rulesets Daily, replay et vue `daily_leaderboard` | `authoritativeDaily.database.test.ts`, `dailyPages.test.tsx`, `database.test.ts` | Livré ; invité local non officiel |
| Social et classement | alias/anonymisation/opt-out, saisons, versions et modération privée | `socialLeaderboardContract.test.ts`, `supabaseRepositories.test.ts` | Livré ; partage, amis et spectateur volontairement absents |
| Administration | route admin, RPC/vues bornées et export CSV neutralisé | `adminData.test.tsx`, `adminCsv.test.ts`, `logSecurity.database.test.ts` | Livré pour les opérations documentées |
| Responsive et accessibilité automatisée | shell partagé, styles mobiles, focus et mouvement réduit | specs `auth-menu`, `game-screens`, `accessibility*` | Livré au niveau automatisé ; revue lecteur d'écran humaine restante |
| Assets Riot hors ligne au build | manifest SHA-256 et paquet `public/assets/riot` | `assetDelivery.test.ts`, `test:assets-clean`, `assets:verify:dist` | Livré : 187 fichiers versionnés |
| Navigateurs de production | `playwright.production.config.ts` | `production-matrix.spec.ts` | Chromium, Firefox et WebKit, desktop/mobile |
| Audit des dépendances | `check-dependency-audit.mjs` | `npm run audit:security` | Livré : aucune alerte haute/critique au 8 août 2026 |
| Exploitation et restauration | `operations`, `incident-runbooks`, `backup-and-restore`, `release-and-support` | runbooks versionnés et critères de preuve | Livré côté procédures ; exercice distant requis avant bêta |
| Équilibrage et contenu enrichi | règles actuelles et tests déterministes | tests de contenu actuels | À faire en P3 |

Les fichiers de tests cités sont sous `tests/` ou `e2e/`. Si une ligne perd sa
preuve ou si son test est ignoré durablement, son statut doit être rétrogradé.
