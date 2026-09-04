# Registre des versions authority

`config/authority-versions.json` est l'unique source de vérité des contrats de replay.
Chaque entrée relie la version moteur aux versions gameplay, progression et commande,
au hash de contenu, au bundle immuable, à la migration SQL, aux capacités et à son statut :

- `current` démarre les nouveaux attempts ; une seule entrée peut avoir ce statut ;
- `replay-only` reste déployée dans `verify-run` pour terminer les attempts en vol ;
- `unsupported` conserve un bundle auditable, mais n'est plus chargé par la fonction Edge.

Le client résout ses comportements via `features`, notamment
`features.canonicalProgression`. Le resolver Edge est généré depuis le même registre :

```bash
npm run authority:generate
npm run edge:bundle
```

Le fichier `authority-version-resolver.generated.ts` doit être commité. Il ne doit pas
être modifié directement. Le build vérifie qu'il correspond exactement au registre,
que le moteur courant et son hash sont déclarés, que chaque migration publie les mêmes
métadonnées et que chaque bundle historique enregistre le verifier attendu.

## Publier la version suivante

Pour passer, par exemple, de v17 à v18 :

1. archiver le bundle courant sous un nom versionné et décider s'il reste
   `replay-only` ou devient `unsupported` ;
2. ajouter une seule entrée v18 dans `config/authority-versions.json`, avec les
   capacités complètes et le chemin de la nouvelle migration ;
3. déclarer v18 et son hash dans le moteur, puis exécuter
   `npm run authority:generate` ;
4. lancer `npm run edge:bundle`, les tests et la validation de base de données ;
5. déployer `verify-run`, puis le client, avant d'activer la migration.

Il n'existe aucune liste parallèle de moteurs canoniques ou rejouables à éditer.
Toute version rencontrée dans une migration ou un bundle sans entrée compatible fait
échouer le build avant publication.

## Publication early Top v18

La migration `20260828150025_gameplay_ruleset_v18_early_top.sql` publie
`run-engine-v18` et le hash
`9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17`. Elle copie le
catalogue gameplay v17 sans en modifier les lignes, vérifie la parité dans les deux
sens, puis publie le Daily v18 dans le namespace `lolrogue.daily.v18`. Le score reste
en version 15 et conserve `gold_points = 0`.

Le bundle v17 est archivé byte-for-byte dans
`run-authority-v17.bundle.ts` (824 777 octets, SHA-256
`bfcc01a5d7c02c21fc22700819a6f2f9380661b3d5f035ff9a926dc47fa5e78c`). Le wrapper
SQL v18 délègue au contrat v17 après une traduction temporaire de l'identité moteur ;
les deux fonctions retirent l'exécution à `PUBLIC`, `anon` et `authenticated`, et seul
le wrapper courant est accordé à `service_role`.

## Publication combat v19

La migration `20260830093859_gameplay_ruleset_v19_combat_balance.sql` publie
`run-engine-v19` et le hash
`45a1dbb93be5a25281ba6fce56517be382ddff6210dce9a55ef3d1ac7c971099`. Elle copie le
catalogue gameplay v18 avec une comparaison bidirectionnelle, puis publie le Daily
v19 dans `lolrogue.daily.v19`. Le barème reste en version 15 avec
`gold_points = 0`.

Le bundle v18 est archivé byte-for-byte dans
`run-authority-v18.bundle.ts` (824 932 octets, SHA-256
`48ac21b1aeea3690dc6792cf273e33991a7180d4f8f01f234f3054f560205293`). Sa baseline
P0 reste inchangée (SHA-256
`2e807afd79205f9e1253e351f65ea4820c58051c9248edca76a664364e7371ab`). Le wrapper
SQL v19 délègue au contrat v18 après traduction temporaire de l'identité moteur et
conserve la même frontière `service_role`.

## Publication carte et économie v20

La migration `20260831152608_gameplay_ruleset_v20_map_economy.sql` publie
`run-engine-v20` et le hash
`8308ebe66c3ee45850b68560b0449b6660b24c2a0e81a5070f6d1794620cac91`. Elle copie le
catalogue gameplay v19 avec comparaison bidirectionnelle, publie le Daily v20 dans
`lolrogue.daily.v20` et conserve le barème `score_version = 15` avec
`gold_points = 0`.

La même migration active le progression ruleset v3 et le ledger v2 : le replay
enregistre, pour chaque champion, les vagues et biomes réellement parcourus, puis le
serveur répartit exactement un budget de candies de compte pondéré par cette
participation. Les colonnes de participation restent nullables pour l'historique v1,
qui n'est ni réécrit ni doté de participation synthétique.

Le bundle v19 est archivé byte-for-byte dans
`run-authority-v19.bundle.ts` (836 449 octets, SHA-256
`55df03729dc47417db3efb28ba534cbbf830f9cd3c771e4fdcda8d33eb9996eb`). Il reste
`replay-only`, tandis que v20 est l'unique moteur `current`. Le wrapper de finalisation
v20 conserve la délégation v19 pour les attempts historiques et limite le nouveau
contrat de progression à `service_role`.

## Publication des gates de balance v21

La migration `20260904151818_gameplay_ruleset_v21_balance_acceptance.sql` publie
`run-engine-v21` et le hash
`9a83e7631f67d28e47c2cd1e8a0237d1009e8d53416aa97525ee088a1d5a38a6`. Elle copie
le catalogue gameplay v20 avec comparaison bidirectionnelle, publie le Daily v21
dans `lolrogue.daily.v21` et conserve `score_version = 15` avec `gold_points = 0`.
La progression reste en v3, le schéma de commandes en v2 et le ledger en v2.

Le bundle v20 est archivé byte-for-byte dans `run-authority-v20.bundle.ts`
(840 942 octets, SHA-256
`6c276bb64e81bd3117600b05d983b0018085d341c21c51960c964b7c551a34a7`). v20 passe
en `replay-only` et v21 devient l'unique moteur `current`. Le wrapper v21 délègue les
attempts historiques au contrat v20 archivé ; les deux fonctions retirent l'exécution
à `PUBLIC`, `anon`, `authenticated` et au wrapper historique lui-même, tandis que seul
le contrat courant est accordé à `service_role`. `npm run backend:deploy` publie la
fonction Edge sans activer la migration ; le frontend v21 doit ensuite être réellement
déployé avant l'appel explicite à `npm run migrate`, afin d'éviter toute fenêtre où
v21 serait créable sans client ou resolver compatible.
