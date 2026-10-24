# Validation ADM-20 — Arbres Candies et spécialisations

ADM-20 a été implémenté avec TREE-10 dans la [PR #242](https://github.com/Thanan71/LolRogue/pull/242), fusionnée vers `dev` le 22 octobre 2026 sous `6f1057733eb9acc2c2d99b88e3cf7f81e120cf57`. Cette clôture rapproche le backlog admin de cette implémentation et complète son contrat d’exploitation ; elle n’ajoute pas un autre système de mesure.

Application **0.3.0**, patch notes FR/EN publication **20**, entrée « L’administration Équilibrage rassemble les achats, resets et builds d’arbres des runs vérifiées ». La publication existante couvre ADM-20 ; cette mise à jour documentaire ne crée pas une nouvelle version du jeu.

## Sources et accès

| Élément                  | Source et comportement                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrée admin             | `/admin`, Équilibrage, panneau **Arbres et Candies** ; même espace, filtres et états de ressource que les autres analyses                                                                                                        |
| Achats et resets         | Commandes terminées `progression_commands`, reçus d’achat/reset et `candy_transactions` existants ; les réessais idempotents ne créent pas de nouvelle dépense ni de remboursement supplémentaire                                |
| Couverture               | Date de début du registre, commandes non classées, dépenses attestées et statut de réconciliation ; l’historique absent n’est pas inventé                                                                                        |
| Nœuds et spécialisations | Catalogue courant : disponible, désactivé, prérequis désactivé ou en attente de validation humaine ; aucune collecte des refus individuels ou de l’exposition au catalogue                                                       |
| Builds et victoire       | Rangs figés dans la tentative liée au résultat vérifié, séparés par champion, snapshot et contexte exact de règles/composition ; un reset ultérieur ne réécrit pas la run                                                        |
| Permissions              | `public.admin_balance_trees` est invoker ; le dispatcher privé vérifie le compte enregistré et le rôle admin courant en base. Refus `42501` pour anon, invité, utilisateur ordinaire et rôle révoqué, y compris avec le même JWT |

La migration `20261022164033_admin_enhancement_analytics.sql` fournit cette projection. Elle s’inscrit dans les quatre migrations TREE de 0.3.0, jusqu’à `20261022164730_gameplay_ruleset_0_3_0_enhancement_trees.sql`. Les contrats client sont dans `src/features/administration/domain/balance`, le transport dans `infrastructure/balance/adminTreeClient.ts`, le chargement dans `hooks/balance/useAdminBalance.ts` et le rendu dans `ui/balance/AdminBalanceTrees.tsx`.

## Requête et lecture des résultats

Avec la session d’un compte admin enregistré, le client appelle `POST /rest/v1/rpc/admin_balance_trees`. Exemple de corps, également utilisé pour les fixtures temporelles locales :

```json
{
  "p_filters": {
    "from": "2024-02-01",
    "to": "2024-02-01",
    "progressionVersion": 4,
    "championId": "Garen"
  },
  "p_snapshot": null
}
```

Le serveur choisit l’instant d’observation lorsque `p_snapshot` est nul. Les bornes de dates sont inclusives en UTC. Les filtres sont validés côté serveur et la réponse les répercute avec `snapshotAt`. Les fixtures de 2024 ne décrivent aucune activité distante réelle.
- **Achats :** période, version de progression et champion. Les dimensions moteur, gameplay, commandes, contenu, mode et difficulté filtrent uniquement les runs.
- **Parts :** nombre d’acheteurs du nœud ou de la branche rapporté aux acheteurs de la période ; au moins 30 acheteurs dans la ligne et le dénominateur. Les parts peuvent se recouvrir et ne sont pas des taux de conversion.
- **Victoires :** taux masqué sous 30 runs ou 30 joueurs distincts, et pour tout snapshot partiel. Un joueur répété interdit l’intervalle Wilson, même quand le taux descriptif devient affichable. Aucune causalité d’une amélioration n’est mesurée.
- **Cardinalité :** 200 builds au maximum, avec `totalBuilds` et `buildsTruncated` explicites. Une portée excessive des autres agrégats est refusée (`22023`) et doit être affinée.
- **Confidentialité et erreurs :** aucune identité de compte dans la projection. Une erreur réseau conserve un résultat signalé comme ancien ; un refus d’autorisation purge toutes les ressources d’équilibrage et interdit le réessai.

Le [contrat de l’espace Équilibrage](admin-balance.md#arbres-candies-et-spécialisations--adm-20--tree-10) reste la référence pour les populations et limites.

## Jeux de données et résultats attendus

| Vérification                  | Fixture et résultat attendu                                                                                                                                                              | Preuve                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Absence d’activité            | Population N0, aucun achat/reset/build ; catalogue de 88 nœuds : 57 disponibles, 12 désactivés, 3 dépendances bloquées et 16 extensions gated                                            | `tests/adminTree.database.test.ts`                                                             |
| Achats répétés et reset       | Achat Garen de 20, reset remboursé de 20, nouvel achat de 20 : 2 achats, 1 reset, 40 dépensées, 20 remboursées, 1 acheteur, solde final 80 sur 100 initiales                             | `tests/adminTree.database.test.ts`                                                             |
| Idempotence                   | Même commande d’achat/reset rejouée ; pas de second prélèvement/remboursement, révision et catalogue contrôlés                                                                           | `tests/enhancementPurchases.database.test.ts`, `tests/enhancementReset.database.test.ts`       |
| Snapshots historiques         | Deux builds figés du même joueur restent séparés par leurs rangs/hash ; aucun taux pour ce petit échantillon                                                                             | `tests/adminTree.database.test.ts`                                                             |
| Échantillon exploitable       | 30 joueurs distincts, 30 résultats complets et 15 victoires : taux 50 % et Wilson ; runs rejetées, preuve non liée et snapshot malformé exclus ou signalés partiels                      | `tests/adminTree.database.test.ts`                                                             |
| Droits réels et lecture seule | Rôles anon/utilisateur/admin, révocation sur le même JWT, helpers privés sans grants ; aucune mutation des wallets, règles, runs ou événements par les lectures                          | `tests/adminBalancePrivileges.database.test.ts`                                                |
| Contrat et présentation       | Refus des projections incohérentes ou contenant de la PII ; couverture, troncature, identifiants historiques, petits échantillons et états de chargement/erreur visibles                 | `tests/adminTreeReport.test.ts`, `tests/adminTreeUi.test.tsx`, `tests/adminBalanceUi.test.tsx` |
| Navigateur                    | Filtres, erreurs indépendantes, purge des données au refus de rôle, garde d’URL, FR/EN, clavier, reflow à 320 px et analyse axe ; session réelle et quatre RPC dans le parcours connecté | `e2e/admin-balance.spec.ts`, `e2e/admin-balance-connected.spec.ts`                             |

## Vérification ciblée de clôture

Le 22 octobre, sur les sources fusionnées de la PR #242 (`1f997eb286a659dac38e21b50d69eb0496a69cb9`, identiques au merge `6f10577`), sous Node 24 :
- **125 tests réussis**, 5 fichiers : rapports d’arbres, interface arbres, interface/client/statistiques d’équilibrage.
- **30 tests PostgreSQL réussis**, 4 fichiers : agrégats arbres, privilèges équilibrage, achats et resets ; Supabase local migré, sans test ignoré.
- **5 parcours Chromium réussis**, sans réessai : 4 avec fixtures de présentation et 1 avec Auth/PostgreSQL et quatre RPC réels, dont la révocation du rôle sur le même JWT.

Reproduction dans un environnement local jetable configuré selon les helpers du dépôt :

```sh
npm test -- tests/adminTreeReport.test.ts tests/adminTreeUi.test.tsx tests/adminBalanceUi.test.tsx tests/adminBalanceClient.test.ts tests/adminBalanceStatistics.test.ts
DB_TEST_REQUIRED=1 npm test -- --no-file-parallelism tests/adminTree.database.test.ts tests/adminBalancePrivileges.database.test.ts tests/enhancementPurchases.database.test.ts tests/enhancementReset.database.test.ts
npm run test:e2e -- e2e/admin-balance.spec.ts --workers=1
E2E_REQUIRE_CONNECTED=1 npm run test:e2e -- e2e/admin-balance-connected.spec.ts --workers=1
```

Les variables Supabase de test doivent viser uniquement la boucle locale ; ne pas exécuter les fixtures sur une base distante. Les tests connectés refusent une configuration absente ou non locale lorsqu’ils sont obligatoires. Le [rapport TREE 0.3.0](enhancement-trees-validation-0.3.0.md) conserve les preuves plus larges et la CI de la PR d’implémentation.

## Livraison et limites restantes

Les huit voies spécialisées restent derrière `champion_specializations=false` jusqu’à l’approbation des playtests humains d’équilibrage. Les compteurs de disponibilité admin ne lèvent pas cette gate. Les attestations humaines ADM-34 et TREE-08 gardent leur périmètre propre ; aucune nouvelle validation humaine de ce panneau n’est déduite des tests automatiques.

La PR #242 est fusionnée vers `dev`. Cette clôture documentaire ne déploie ni migration distante, ni Edge Function, ni frontend et ne prouve pas leur état actuel. Vérifier séparément le déploiement sur la cible autorisée : `dev → LolRogueDev`, `main → LolRogue`.
