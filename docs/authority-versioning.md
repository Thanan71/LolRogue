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

Pour passer, par exemple, de v15 à v16 :

1. archiver le bundle courant sous un nom versionné et décider s'il reste
   `replay-only` ou devient `unsupported` ;
2. ajouter une seule entrée v16 dans `config/authority-versions.json`, avec les
   capacités complètes et le chemin de la nouvelle migration ;
3. déclarer v16 et son hash dans le moteur, puis exécuter
   `npm run authority:generate` ;
4. lancer `npm run edge:bundle`, les tests et la validation de base de données ;
5. déployer `verify-run`, puis le client, avant d'activer la migration.

Il n'existe aucune liste parallèle de moteurs canoniques ou rejouables à éditer.
Toute version rencontrée dans une migration ou un bundle sans entrée compatible fait
échouer le build avant publication.
