# Contrat de l’extraction des moteurs — ARCH-15

Le pilote UI n’ajoute aucune règle dans React. `BattleManager` et `AuthorityRunEngine` conservent leurs API publiques ; trois unités synchrones portent désormais des étapes déterministes déjà présentes. Les résultats à seed identique restent identiques, y compris en Daily.

## Responsabilités et ordre d’appel

| Unité | Entrées et préconditions | Responsabilité et effets observables |
| --- | --- | --- |
| `BattleActionExecutor` | Combatant et action validée par `BattleActionValidator`, callbacks du moteur | Passifs avant action ; attaque puis passifs après attaque, ou validation de disponibilité du sort, cooldown, débit MP, `ability_cast`, effets dans l’ordre du catalogue, passifs après sort. Le manager garde le contexte `_activeActionType` pendant toute cette séquence. |
| `BattleRuleEffectResolver` | Effet immédiat et callbacks du moteur, source/cible résolues par leur identité | Ignore source/cible absente et quantité non positive ; applique heal/damage/mana/shield/DoT/slow/snare sans changer les événements ni leur ordre. Les dégâts de règle gardent les trois flags à `false` pour éviter une redispatch récursive. Le manager conserve le rafraîchissement HP avant/après la liste d’effets. |
| `DeterministicCombatReplay` | JSON compact ou `auto`, index de commande, battle et callback de capture des ressources | Décode avant construction du battle ; installe le lecteur manuel sans consommer d’entrée fictive pour un tour sans action ; démarre puis capture joueurs/ennemis ; avance jusqu’au résultat ou à 100 000 tours ; vérifie le préfixe exact et n’accepte qu’un suffixe automatique inoffensif. |

L’initiative, l’IA, les effets de sorts, les dégâts, les récompenses, les règles de recrutement, les snapshots et la sérialisation des commandes gardent leurs propriétaires existants. Aucun module extrait ne crée son propre RNG, ne dépend de React/Zustand, n’accède au réseau ou ne modifie le journal sérialisé. Les callbacks restent synchrones : aucun `await`, timer ou concurrence nouvelle n’entre dans le cœur déterministe. Chaque replay possède son propre lecteur ; une erreur invalide la session conformément au contrat existant.

Les erreurs restent `invalid_combat_action_trace`, `combat_limit` et `invalid_combat_result`, avec le même index, le même message et le même ordre de validation. Une action non disponible garde le comportement d’origine : aucun débit MP ni effet après échec de `useSpell`.

## Preuve avant/après

La baseline a été capturée au commit `e313c6f657d2662c9c327875463f16b40ddada20`, avant extraction, depuis `run-engine-0.2.0` (`c74af7632acfb7e4a2ff45140d62d0a96bbd6b063994b3f4b43d0f72fa785e16`). [La fixture](../tests/fixtures/engine-refactor-contract.json) contient les longueurs et SHA-256 des octets JSON originaux, sans tri des propriétés, conversion de nombres ou suppression de champs facultatifs :

- six cas : Normal et Daily, seeds `424240`, `2116951237`, `2654435761`, avec Garen, Warwick et Garen/Veigar ;
- ordre et nombre des tirages RNG, événements réellement reçus via `on('event', callback)`, résultat et ressources finales ;
- commandes, trace compacte des actions, snapshots et résumés de combat en auto et avec trace manuelle ; seule l’identité du moteur au niveau de la réponse est comparée séparément ;
- 46 sorties sérialisées Normal/Daily de tous les 23 moteurs historiques, et digest de chacun des 23 bundles complets, y compris ceux hors déploiement.

[Le test de non-régression](../tests/engineRefactorContract.test.ts) vérifie ces 75 cas sans mode de mise à jour automatique. Il retrouve les bundles par identité dans le registre, ce qui permet de préserver la baseline courante lorsqu’elle devient historique. Les événements abonnés ont aussi été recapturés avec le `BattleManager` embarqué dans le bundle original, et tous les autres digests de cette capture comparés à la baseline initiale.

Les campagnes complémentaires restent plus larges que les fixtures unitaires :

- la matrice compare 7 560 combats par runtime, avec parité exacte entre le moteur figé 0.2.0, le nouveau bundle 0.2.5 et les sources courantes ;
- les 180 runs Veigar/Annie/Lux et leurs probes de sécurité reproduisent intégralement le rapport 0.2.0 après normalisation de l’identité dans les commandes de reproduction ;
- tous les résultats de routes et d’économie du rapport à seeds fixes sont identiques hors identité de publication ;
- la cohorte PR conserve sa population de 45 cellules et 30 seeds par cellule, avec un nouvel artefact pour la nouvelle identité et la baseline 0.2.0 conservée.

Les classes de façade passent de 1 668 à 1 561 lignes (`BattleManager`) et de 1 295 à 1 238 (`AuthorityRunEngine`). Les unités extraites font respectivement 82, 98 et 86 lignes. L’objectif est de séparer les responsabilités testables ; le nombre total de lignes inclut les ports explicites et n’est pas un seuil de qualité.

## Publication immuable

Le hash est calculé sur les octets ESM compilés, pas seulement sur les règles. L’extraction change donc le hash structurel même lorsque tous les résultats restent identiques. Le garde-fou a effectivement refusé le refactor avec l’identité 0.2.0 ; il reste actif.

| Dimension | Moteur précédent | Nouveau moteur |
| --- | --- | --- |
| Engine/code public | `run-engine-0.2.0` / `0.2.0` | `run-engine-0.2.5` / `0.2.5` |
| Clé gameplay DB | 23 | 24 |
| Hash | `c74af7632acfb7e4a2ff45140d62d0a96bbd6b063994b3f4b43d0f72fa785e16` | `9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa` |
| Score Daily / progression / commandes / catalogue champion | 15 / 3 / 2 / 2 | 15 / 3 / 2 / 2 |

Le bundle précédent est copié octet pour octet vers `run-authority-0.2.0.bundle.js` et devient `replay-only`. Tous les autres statuts et bundles historiques sont conservés. Le [registre source](../config/authority-versions.json) est l’unique source des résolveurs générés. Les artefacts de balance 0.2.0 gardent leurs octets ; de nouveaux fichiers 0.2.5 portent les identités actuelles.

La [migration de publication](../supabase/migrations/20261011134126_gameplay_ruleset_0_2_5_engine_modules.sql), créée par le CLI Supabase local, copie catalogue et score Daily avec contrôle d’égalité bidirectionnel, puis active ensemble les nouvelles identités. Les défis et tentatives existants gardent leurs identités figées. Le helper privé de finalisation admet les identités exactes 23/24 validées contre le registre DB et restitue l’identité de la tentative après son appel historique interne. Le [test SQL](../tests/enginePublicationContract.test.ts) compare le corps précédent en n’autorisant que ces sept substitutions d’identité : verrouillage, lease, idempotence, attribution des récompenses et permissions sont inchangés. Les tests DB vérifient séparément la finalisation et son retry pour 0.2.0 et 0.2.5.

Cette PR livre la publication, ses migrations et les preuves de compatibilité. Aucune migration distante ni fonction Edge n’est déployée par ce travail ; l’activation de la nouvelle identité dépend du déploiement backend habituel après merge.

## Vérifications reproductibles

```sh
npm run release -- authority check
npm run release -- edge bundle
npm test -- tests/engineRefactorContract.test.ts tests/enginePublicationContract.test.ts tests/authorityRunEngine.test.ts tests/authorityRunEngine.repro.test.ts tests/clientAuthorityParity.test.ts tests/authorityCombatIntegrityParity.test.ts tests/dailyProgressionParity.test.ts
npm run balance -- map-economy check
npm run balance -- combat matrix check
npm run balance -- veigar check --all
npm run balance -- baseline check --all
```

Les tests DB exigent le backend jetable local de la CI ; ils ne doivent pas être lancés avec des clés d’un projet distant. Les preuves navigateur/manuelles du module combat sont suivies avec ARCH-13, indépendamment de ces contrats moteur.
