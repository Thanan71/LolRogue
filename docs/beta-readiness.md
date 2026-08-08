# Gate de sortie bêta

Cette page est la fiche de décision publique du jalon bêta. Une case « démontrée »
signifie qu'une preuve reproductible existe dans le dépôt. Elle ne remplace ni la
fiche de release privée, ni les validations humaines et externes.

## État au 8 août 2026

| Gate | État | Preuve ou action restante |
| --- | --- | --- |
| Aucun P0 ouvert | Démontré | Tous les chantiers `P0-*` de `TODO.md` sont clos. |
| Trois CI complètes consécutives | Bloqué | Deux réussites consécutives confirmées sur `main` (`a766c79`, `6aa9912`) ; l'exécution suivante doit finir verte avant de compter. |
| E2E victoire, défaite et Daily sans store | Bloqué | `six-biome-run.spec.ts` pilote victoire et défaite uniquement par l'UI. Il manque le parcours Daily connecté complet par l'UI. |
| Accessibilité WCAG AA sans blocage | Bloqué humain | axe bloque les violations sérieuses/critiques, mais la revue NVDA + Firefox et VoiceOver + Safari/iOS exigée par `accessibility.md` reste à consigner. |
| Matrice responsive sans contrôle inaccessible | Démontré automatiquement | `game-screens-responsive.spec.ts`, `accessibility-display.spec.ts` et `production-matrix.spec.ts`. |
| Clone propre et assets sur le déploiement | Bloqué déploiement | Le job `clean-room`, `test:assets-clean` et `assets:verify:dist` prouvent le clone/build. Le smoke test doit encore vérifier le déploiement candidat. |
| Falsification de progression impossible | Démontré automatiquement | Tests d'autorité, de ciblage forgé et tests DB/RLS, notamment `authorityRunEngine.test.ts` et `database.test.ts`. |
| Sauvegarde atomique, idempotente et récupérable | Démontré automatiquement | `runSaveRecovery.test.ts`, `runFinalization.test.ts` et tests RPC sur une base locale réelle. |
| Règles affichées alignées sur les handlers | Démontré automatiquement | Contrats de parité, règles versionnées et `i18nContract.test.ts`. |
| Documentation d'exploitation et de confidentialité à jour | Démontré côté dépôt | `operations`, runbooks, sauvegarde, release/support et contrat légal sont reliés et testés. Les autorisations juridiques externes restent un gate distinct. |

La sortie bêta est donc **interdite** tant que les quatre lignes bloquées ne sont
pas accompagnées de leurs preuves, même si le reste de la CI est vert.

## Preuves à consigner dans la fiche de release

### Trois CI consécutives

Conserver les trois URL GitHub Actions, leur commit et la conclusion de chacun. Les
trois exécutions doivent inclure les jobs `validate`, `e2e`, `database` et
`clean-room`; une annulation ou un rerun partiel remet le compteur à zéro.

### Daily E2E réel

Le scénario doit créer un compte de test par l'interface, ouvrir le Daily depuis le
menu, accepter uniquement la seed/difficulté reçues du serveur, terminer ou
abandonner la tentative, puis constater son statut serveur. Il est interdit
d'importer `runStore`, d'appeler `setState/getState` ou d'écrire directement dans
le stockage navigateur pour franchir une étape.

### Revue accessibilité humaine

Consigner appareil, OS, navigateur, lecteur d'écran, commit, parcours et résultat
pour NVDA + Firefox et VoiceOver + Safari/iOS. Tout blocage clavier, focus perdu,
annonce absente ou ordre de lecture empêchant la progression bloque la release.

### Déploiement candidat et assets

Sur l'URL candidate issue du commit validé, exécuter le smoke test de
`release-and-support.md`, contrôler l'absence de 404/CSP dans le réseau et charger
au moins un portrait de champion et une icône d'objet depuis le manifeste Riot.
L'artefact ne doit pas être reconstruit après validation.

## Gates externes supplémentaires

Même après les dix critères techniques, la bêta publique reste bloquée par les
points ouverts de `legal-and-privacy.md` : analyse juridique France/UE, canal de
support publié et clarification écrite de l'autorisation d'utiliser la propriété
intellectuelle Riot. Ces preuves ne peuvent pas être remplacées par un test local.
