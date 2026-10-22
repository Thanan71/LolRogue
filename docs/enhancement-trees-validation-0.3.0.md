# TREE — Livraison 0.3.0

Cette livraison traite TREE-02 à TREE-10 sur la base de l’audit TREE-01. La validation du code, les essais humains, la CI, la fusion et le déploiement ont des preuves distinctes. Aucune migration distante ni activation des spécialisations n’est attestée par ce document.

## Contrats livrés

| Sujet | Comportement |
| --- | --- |
| Catalogue | Version de progression 4, contrat de graphe 1 : 72 nœuds historiques et 16 extensions de champion. IDs, prix et achats historiques conservés. |
| Disponibilité | 12 effets non pris en charge restent explicitement désactivés ; leurs 3 descendants sont bloqués par leur prérequis. Aucun chemin fictif n’est créé. Les effets pris en charge et les descriptions FR/EN concordent. |
| Graphe | Préconditions AND/OR, rang minimal, maîtrise, exclusions, budget et publication évalués par les fonctions pures et le serveur. Le planificateur ne dépense rien. |
| Activation | Seuls les rangs légaux et leurs ancêtres actifs contribuent au combat. Les anciens achats incompatibles restent dans le compte pour le remboursement attesté. |
| Effets | Phénix : bouclier 200 pendant 2 tours, une fois par combat ; Tir déchirant : probabilité 15 %, total exact de 5 % des PV maximum en 3 ticks ; Combustion : +15 % de puissance ; Canalisation : +10 points de hâte. Auras et effets sont rattachés au bon camp et au bon combattant. |
| Spécialisations | Garen, Annie, Soraka et Jinx : deux voies exclusives de deux nœuds par champion, maîtrise 2/3 et coûts 80/120. Le flag `champion_specializations` reste fermé avant validation humaine. |
| Reset | Tous les resets sont gratuits. Seules les dépenses réellement attestées sont restituées, sans double remboursement. Révision, version de catalogue et politique sont contrôlées à la confirmation. Maîtrise, Éclats, acquisitions et snapshot d’une run active sont conservés. |
| Interface | Solde du compte et maîtrise séparés ; rangs, blocages, coût du chemin, exemple avant/après et confirmation. Navigation clavier, focus, mobile, zoom et deux langues sont couverts par les contrôles dédiés. |
| Économie | Prix inchangés, pas de conversion de monnaie. Simulations reproductibles avec hypothèses et censure explicites ; les 400 Éclats de l’acquisition permanente restent inchangés. |
| Administration | ADM-20 consomme les agrégats du registre existant : achats, resets, branches, disponibilité et builds figés des runs vérifiées. Aucun second wallet ni second dashboard. |

La politique de reset gratuite est une décision de cette livraison. La proposition de taxe de 10 % n’était pas validée ; les simulations montrent une perte de 50 à 78 Candies par arbre supporté et ne fournissent pas de justification à ce prélèvement. Voir [le modèle économique](enhancement-economy.md).

## Runs et compatibilité

Les nouvelles runs utilisent `run-engine-0.3.0`, gameplay 25, progression 4, commandes 2, score Daily 15 et catalogue champions 2. Leur hash est `a5ba6703640a3f92595318d2a49ba0a4faebcbbbaa18d0a90bd0bb48074923f2`. Le trigger INSERT filtre le snapshot avec la maîtrise effectivement figée puis recalcule le hash initial du journal ; les mises à jour historiques ne passent pas par ce filtre.

Le moteur 0.2.5 est archivé octet pour octet, avec son hash publié conservé. La reprise client d’une run encore rejouable charge ce moteur à la demande et annonce explicitement la reprise automatique du combat depuis son début. Journal, ressources, progression, carte et inventaire sont appliqués ensemble après un replay réussi ; un échec garde la run intacte et permet de réessayer. Aucun combat historique ne reçoit silencieusement les nouveaux effets.

La progression 4 change l’éligibilité des achats, pas la formule de récompense. Le serveur vérifie l’identité 25/4 et applique la même allocation entière de participation que la progression 3, sous les véritables identités de gameplay et de progression. Seul le moteur est temporairement projeté vers le contrat v19 déjà utilisé par la chaîne historique, sous verrou transactionnel, puis restauré. Les champs de récompense des deux versions sont explicitement comparés dans la migration. Les anciens appels conservent leur fonction historique inchangée. Le Daily conserve sa version 25, son score 15, sa seed et sa date pendant la finalisation ; ses gains de participation habituels restent attribués une seule fois. La neutralité concerne le loadout, pas une suppression des récompenses.

## Mesure et limites

Les coûts et durées de [l’audit généré](audits/enhancement-trees.md) proviennent des données et du modèle. La durée supposée de 35 minutes par run, les rythmes casual/régulier et les probabilités de victoire sont des hypothèses synthétiques. Ils ne constituent pas une mesure de rétention ou une approbation humaine de balance.

Le comparatif des spécialisations emploie 48 combats contrôlés, avec les mêmes ressources, ennemis et seeds. Les 48 défaites et les effets conditionnels parfois non observés dans ce scénario sont conservés dans la preuve. Ce scénario mesure certaines différences ; il ne suffit pas à approuver l’équilibrage ni à ouvrir le flag.

Les achats admin sont filtrés par période, progression et champion ; les dimensions moteur/mode/difficulté filtrent les runs seulement. La part d’acheteurs n’est pas une conversion : l’exposition au catalogue n’est pas collectée. Les taux exigent au moins 30 observations et 30 joueurs ; les joueurs répétés n’obtiennent pas un intervalle d’indépendance fictif. Les états incomplets du registre et les 200 builds maximum sont signalés. Les DTO agrégés ne contiennent pas d’identifiants de comptes.

Le catalogue de champions maintenu ne contient actuellement aucun premier rôle Assassin. Les effets de ce rôle sont testés dans des combats isolés réels ; cela ne prouve pas l’existence d’un parcours public Assassin jouable. Le support de Katarina et ses resets/actions supplémentaires appartient toujours à P3-CHAMP-03.

## Preuves et reproduction

Contrôles locaux du 22 octobre 2026, sous Node 24 :

| Contrôle | Preuve |
| --- | --- |
| Suite complète avec couverture | Clone propre `4ff2000` : 4 156 tests réussis, 327 probes connectés ignorés dans cette commande puis exécutés séparément ci-dessous. Couverture des lignes : 89,51 %, modules enhancements inclus ; aucun seuil réduit. |
| PostgreSQL local migré | **371/371**, 34 fichiers ; achats, resets, concurrences, RLS/ACL, administration, versions historiques et finalisation Daily 25. |
| Schéma et identité | 77 migrations, types générés comparés, lint sans erreur ; 25 versions authority et hash courant vérifiés. |
| Rollback applicatif réel | **33/33**, dépendances verrouillées du checkpoint `f5a3fed3587c34a61d7a8d70d18f01d9ebc464b8`, sur le schéma courant ; aucun reset de données. |
| Nouvelle UI | 24 tests UI ; 5 scénarios de présentation FR/EN, 320 px, zoom natif 200/400 %, axe et retour du focus. |
| Campagne connectée | **9/9**, avec de vraies sessions, RPC et permissions ; Daily, économie, administration et nouvel arbre. |
| Arbre connecté | Achat réel 20 puis 30, solde 950 après reload ; reset commité puis réponse réseau abandonnée, même commande rejouée, un seul remboursement de 50, solde 1 000. Maîtrise, Éclats et snapshot de run active conservés. |
| Administration connectée | Quatre RPC réels, catalogue de 88 nœuds, refus après révocation du rôle dans la base. |
| Reproduction moteur | 213 tests ciblés et trois générations complètes reproductibles sous le hash final ; archive 0.2.5 et goldens historiques inchangés. |
| Build et sécurité | Production-build et budgets réussis ; 0 vulnérabilité npm. JS total 890 129 octets gzip, marge 12,73 %, moteur historique différé hors Auth. |

Le clone propre `4ff2000` a réussi `npm ci` avec cache vierge et environnement nettoyé, puis `npm run check` complet (statique, couverture, sécurité, assets et production). Les corrections ultérieures du manifeste de privilèges et des fixtures navigateur sont contrôlées séparément et par la CI du dernier SHA.

La campagne source a vérifié les 97 scénarios non affectés puis les 7 scénarios corrigés (quatre admin et trois sauvegarde/rechargement), soit 104 scénarios actuels. La matrice production locale passe Chromium et WebKit sur desktop/mobile ; les deux Firefox sont bloqués avant le scénario par leur profil local macOS (`Could not find profile folder`), à confirmer dans la CI Linux.

Les liens et résultats de CI sont suivis sur [la PR #242 vers dev](https://github.com/Thanan71/LolRogue/pull/242). La Preview automatique a renvoyé HTTP 200 sur son identité de déploiement pour le commit `69c31fdd2c95fa5e88128f908feea1b78121ba27`. Cela atteste le frontend publié automatiquement, pas la migration ni les Edge Functions distantes. Les résultats locaux ne prouvent aucune migration distante, fusion ou mise en production. Les tests unitaires ne remplacent pas les tests PostgreSQL connectés ; les fixtures de présentation ne prouvent pas les débits et permissions réels.

```sh
npm run typecheck
npm run check:unit
npm run check:db
npm run test:db:rollback
npm run testing -- enhancements audit --check
npm run release -- artifacts check
npm run test:e2e -- e2e/enhancement-tree.spec.ts
E2E_REQUIRE_CONNECTED=1 npm run test:e2e -- e2e/enhancement-tree-connected.spec.ts
npm run check:build
```

Utiliser Node 24 et Supabase local. Ne pas exécuter un reset ou les fixtures contre une base distante. Les captures et mesures de zoom sont des artefacts de tests, exclus des commits.

## Gates humaines et activation

- **VoiceOver validé par l’utilisateur le 22 octobre 2026**, sur le parcours local proposé (branches, rangs, blocages, achat et reset annulés, retour du focus), candidat `69c31fdd2c95fa5e88128f908feea1b78121ba27`. L’utilisateur déclare Safari et macOS dans leur dernière version ; les numéros exacts et la langue ne sont pas fournis. Le parcours demandé utilisait les libellés FR. Cette attestation humaine est conservée avec ces limites, sans inventer de versions numériques ni de résultat NVDA.
- Effectuer le protocole humain de balance sur une cellule figée (SHA, moteur, hash, difficulté, équipe et voie). Ne pas compter les simulations ni plusieurs runs d’un même joueur comme autant de joueurs indépendants.
- Conserver `champion_specializations=false` tant que ces résultats ne sont pas approuvés. L’interface expose les voies en attente sans accepter leur achat ; les nœuds déjà attestés restent actifs si le flag est fermé après une publication.
- Vérifier la CI et la Preview du candidat, puis appliquer les migrations et déployer les Edge Functions sur la cible autorisée. `dev` correspond à LolRogueDev ; la fusion et le déploiement ne sont pas déduits des tests locaux.

La vérification humaine ADM-34 du 21 octobre concernait l’administration précédente ; elle n’est pas réutilisée comme preuve de cette nouvelle interface d’arbres.
