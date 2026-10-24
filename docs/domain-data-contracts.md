# Contrats de données et invariants métier

ARCH-11 conserve les points d'import existants et les formats des sauvegardes. Une
ressemblance de champs ne suffit pas à rendre deux modèles interchangeables. Le
contrat authority possède les valeurs de difficulté et de mode ; les contrats du
navigateur les réexportent avec `export type` et les anciennes API restent valides.

## Matrice d'appartenance

| Donnée                                    | Propriétaire et export stable                                                                                                      | Entrée et préconditions                                                       | Responsabilité et invariants                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue champion                        | `src/types/champion.ts` : `Champion`, `ChampionStats`, `Spell`, `Passive` ; contenu `src/data/champion/*`                          | ID de catalogue, statistiques de base et définitions versionnées              | Décrit le contenu de jeu. Ne contient ni PV courants, ni progression d'un compte. L'instance de combat lit ce catalogue sans y enregistrer ses mutations.                                                                                                                             |
| Instance de combat                        | `src/game/ChampionInstance.ts` : `ChampionInstance`, `ChampionSnapshot`                                                            | `Champion`, niveau, multiplicateur, bonus, rangs et compteurs de run validés  | Calcule les statistiques et gère les ressources/cooldowns de cette instance. Un snapshot sérialisable représente ses valeurs ; il ne remplace pas la classe ni le catalogue.                                                                                                          |
| Membre d'équipe persistant                | `src/types/run.ts` : `TeamMember`                                                                                                  | `championId`, champs optionnels de niveau/PV/PM/XP/rangs/compteurs            | Décrit la continuité entre combats. Les anciens champs absents restent optionnels ; normalisation et reconstruction appartiennent à `teamRules`/`runCombatant`. Les compteurs de Veigar appartiennent à la run, jamais au catalogue ou au compte.                                     |
| État d'une run                            | `src/types/run.ts` : `RunState`, `RunActions`, `RunStore`                                                                          | État initial ou cache local validé, identifiant de run et carte déterministe  | Zustand possède les mutations et sa politique de persistance/merge unique. `runDomainInvariants` contrôle l'équipe, l'inventaire et les upgrades ; les actions exposées ne changent pas de signature.                                                                                 |
| Résultat figé                             | `src/types/run.ts` : `RunSavePayload`, `CompletedRunSnapshot`, `RunLedger`                                                         | Run terminée et statistiques du ledger                                        | Le payload est figé avant l'appel de sauvegarde et conservé pour les retries. Une nouvelle tentative ne recalcule pas les récompenses d'après l'UI. Le ledger conserve sa version et ses compteurs.                                                                                   |
| Résultat Daily et métadonnées             | `src/types/dailyRun.ts` : `DailyChallenge`, `DailyCompletionInput`, `DailyLeaderboardEntry`                                        | Challenge UTC canonique ou résultat invité local ; score et compteurs de run  | Le contrat d'entrée de fin de Daily est indépendant du store. Les dates/versions de challenge, score et gameplay restent distinctes ; un score local invité ne devient pas un résultat serveur.                                                                                       |
| Tentative navigateur et journal           | `src/types/runAttempt.ts` : `RunAuthorityAttempt`, `RunAttemptCommand`, `RunCommandInput`                                          | Identité du propriétaire, réponse serveur validée, commandes ordonnées        | Retient l'ID serveur, les versions, la seed, le roster gelé et les acquittements. Les champs gameplay/mastery/access absents dans les anciennes tentatives restent optionnels. Le journal utilise la même séquence et le même finish ID lors d'un retry.                              |
| Replay authority                          | `src/game/authority/types.ts` : `AuthorityRunAttempt`, `AuthorityRunCommand`, `AuthorityDifficulty`, `AuthorityRunMode`            | Faits figés par le serveur et commandes canoniques décodées                   | Le replay possède les règles déterministes et les valeurs de mode/difficulté. Il ne lit aucun hook/store et ne déduit pas une autorisation d'un cache navigateur. `AuthorityRunAttempt` et `RunAuthorityAttempt` représentent deux frontières distinctes.                             |
| Réponse de progression vérifiée           | `src/types/run.ts` : `ServerRunProgression`                                                                                        | Résultat validé de la vérification serveur ; même `runId`                     | Le serveur possède l'attribution de Candies/Shards. `progressionVersion`, `gameplayRulesetVersion` et `engineVersion` sont des dimensions indépendantes. `replayed` exprime l'idempotence du résultat.                                                                                |
| Progression champion du compte            | `src/types/mastery.ts` : `ChampionMastery`, `MasteryMap`, `MasteryProgressionSnapshot`                                             | Candies et unlocks du serveur, ou namespace invité local                      | Le modèle calculé utilise des noms camelCase et ajoute le niveau/progrès. Le namespace `account:<userId>` est isolé ; seul le snapshot invité est durable localement. `masteryService` réutilise `MasteryMap` sans redéfinir sa structure.                                            |
| Devise globale et propriété des champions | `src/types/championEconomy.ts` : `AccountWallet`, `ChampionEconomySnapshot`, `ChampionRunAccessSnapshot`                           | Snapshot RPC validé, identité active, versions du catalogue/économie/rotation | Les Shards sont une devise de compte, distincte des Candies et de l'or de run. Le wallet et la propriété ne sont pas persistés dans le navigateur. L'accès d'une tentative est figé même après expiration locale de sa rotation.                                                      |
| Tables et RPC SQL générés                 | `src/types/database.ts` : `Database`, `Tables`, `TablesInsert`, `TablesUpdate`, `Json`                                             | Schéma de la base issu du générateur, noms SQL et nullabilité                 | Représente la frontière SQL ; ce fichier reste généré et n'accueille pas de modèles UI. Les `Row`, `Insert` et `Update` ne sont pas interchangeables. Les données `Json` d'un RPC passent par un parseur.                                                                             |
| Projections des repositories              | `src/types/models.ts` : `Player`, `Run`, `ChampionMastery`, `RunTeamMember` ; `src/services/interfaces/*`                          | Réponses DB et requêtes typées, sous identité auth/RLS                        | Alias et projections conservant les champs SQL. `models.ChampionMastery` est la ligne `champion_mastery`, distincte de `mastery.ChampionMastery`. Les repositories possèdent l'accès DB, pas la progression locale.                                                                   |
| Présentation UI                           | `src/types/combatPresentation.ts` : `CombatantInfo`, `CombatStatusInfo`, `SpellInfo`, `BattleSpeed` ; états locaux des hooks/pages | Snapshot du combat et état d'affichage                                        | Contrat partagé purement typé, réexporté depuis `battleStore`/`settingsStore` pour les consommateurs historiques. Décrit ce qui est affiché, sans accorder de récompenses ni modifier le replay. `settingsStore.Difficulty` conserve son nom public comme alias du contrat authority. |

## Adaptation entre frontières

- DB → métier : les repositories retournent leurs alias SQL ; l'hydratation et les
  services traduisent explicitement les champs, par exemple `champion_id` /
  `total_candies` vers `championId` / `totalCandies`. Le modèle métier ne reçoit pas
  une ligne SQL par simple assertion de type. L'entrée `hydrateFromDatabase`
  réutilise un `Pick` des trois champs de la ligne générée ; elle ne recopie plus
  leur définition manuellement dans le contrat de maîtrise.
- RPC → authority : `runAttemptService` valide les réponses avant de construire une
  tentative navigateur. Les commandes de l'UI et les commandes canoniques du
  replay possèdent des payloads différents ; les adaptateurs existants les
  transforment, sans créer une deuxième définition de chaque contrat.
- Compte → combat : les snapshots d'améliorations et de maîtrise sont gelés au
  démarrage de la tentative. Un changement de compte ou un refresh tardif ne doit
  pas remplacer ces faits pendant une run.
- Combat → run : les mutations de fin de combat enregistrent les ressources,
  rangs et compteurs de `TeamMember`. Les classes et gestionnaires d'effets ne sont
  pas enregistrés dans localStorage.
- Serveur → UI : un résultat vérifié peut rafraîchir la progression et le wallet.
  Un cache sérialisé, même marqué `verified`, déclenche une lecture du reçu serveur
  après recharge ; il ne constitue pas une preuve d'attribution.

Le contrat commun historique du combat appartient maintenant à
`src/types/combatPresentation.ts`. `src/game/presentation/combatStatuses.ts`
importe **uniquement les types** `CombatantInfo` et `CombatStatusInfo` depuis cette
entrée, et `src/game/battle/autoplay.ts` y prend `BattleSpeed`. Le moteur peut donc
exposer les états visibles sans importer de store. Les anciens exports des stores
sont des réexports typés de compatibilité ; les consumers UI restent compatibles.
La règle automatique des frontières refuse tout import `game → stores`, y compris
les imports de types. Ces changements de types sont effacés du bundle authority ;
le contrôle du hash confirme que les règles exécutables restent identiques.

Les autres dépendances purement typées depuis `src/types` vers des contrats
`src/game` ne chargent pas de stores ou de services au runtime. Les barrels
généraux de services ne constituent pas une nouvelle couche de types : les
appelants utilisent les contrats nommés et les interfaces de repositories.

## Erreurs, absence et concurrence

| Frontière                  | Politique                                                                                                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache local → run          | `isPersistedRunState` vérifie les types, valeurs finies, limites et enums ; `migratePersistedRunState` applique la politique existante. Une valeur numérique sous forme de chaîne ou un enum inconnu est rejeté, jamais converti silencieusement. Les caches incompatibles sont mis en quarantaine. |
| Ancienne tentative         | Les champs optionnels absents sont conservés comme absents. Les versions techniques historiques sont retenues exactement ; aucune conversion date/version, nombre/chaîne ou enum n'est introduite ici.                                                                                              |
| Save/reload/retry          | Le `runId`, le propriétaire et le snapshot sélectionnent la même tentative. Les séquences du journal et l'ID de finish restent stables. Le statut local `saving`/`retrying` interrompu sélectionne le retry existant ; un résultat précédemment sauvegardé sélectionne la récupération du reçu.     |
| Rafraîchissement de compte | Les stores possèdent l'identité/cache UI ; les lectures serveur n'importent pas les stores. Une réponse terminée après un changement d'identité est ignorée et ne doit pas alimenter le compte suivant.                                                                                             |
| Économie et DB absente     | Le catalogue invité fonctionne sans DB. Les achats et l'attribution de devise exigent une identité authentifiée et le serveur. `null` pour le wallet ou pour un accès historique ne signifie pas un solde nul ou un droit acquis.                                                                   |
| Auth/RLS                   | Les interfaces ne constituent pas un contrôle d'accès. Les repositories utilisent le client et les RPC existants ; les droits et l'idempotence demeurent contrôlés par SQL/Edge.                                                                                                                    |

Les sommes ne deviennent pas interchangeables parce qu'elles utilisent `number` :
`gold`, Candies et `shardsBalance` gardent leurs règles propres. Les statistiques
de combat peuvent être fractionnaires ; les compteurs de journal, rangs et Shards
gardent leurs contraintes entières. ARCH-11 ne change ni représentation numérique,
ni formule, ni seuil de progression.

## Vérifications

`tests/domainDataContracts.test.ts` contrôle les exports publics réutilisés, la
distinction DB/métier et la conservation d'un cache schema-v7. La compilation de
`tests` fait partie de `tsconfig.json` : les assertions `expectTypeOf` sont donc
vérifiées par TypeScript, en plus des tests runtime. La compatibilité des
tentatives historiques, des nombres fractionnaires et des enums est vérifiée par
JSON → validation → migration, avec rejet des valeurs mal typées.

Les suites `runPersistenceFuzz`, `runProgressionPersistence`, `runSaveRecovery`,
`runAuthorityJournal`, `mastery` et `championEconomyRunContract` couvrent les
adaptateurs existants. Les compilations app, scripts et E2E vérifient leurs
consommateurs ; les tests de frontières traitent les imports interdits et les
exceptions. Les tests DB réels vérifient séparément les droits RLS et les RPC ;
les tests de types ne remplacent pas cette validation serveur.
