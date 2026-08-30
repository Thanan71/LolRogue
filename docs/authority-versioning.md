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
