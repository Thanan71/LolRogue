# Gate de sortie bêta

Cette page est la fiche de décision publique du jalon bêta. Une case « démontrée »
signifie qu'une preuve reproductible existe dans le dépôt. Elle ne remplace ni la
fiche de release privée, ni les validations humaines et externes.

## État au 8 août 2026

| Gate | État | Preuve ou action restante |
| --- | --- | --- |
| Aucun P0 ouvert | Démontré | Tous les chantiers `P0-*` de `TODO.md` sont clos. |
| Trois CI complètes consécutives | Démontré | Trois réussites complètes consécutives sur `main` : `a766c79`, `6aa9912`, `2c7b3bd`. |
| E2E victoire, défaite et Daily sans store | Démontré | `six-biome-run.spec.ts` pilote victoire/défaite et `connected-daily.spec.ts` crée un compte puis démarre/reprend une tentative serveur uniquement par l'UI. |
| Accessibilité WCAG AA sans blocage détecté | Démontré automatiquement | axe contrôle toutes les règles WCAG A/AA sur le parcours critique ; clavier, focus, reflow, contraste et mouvement sont couverts. La revue lecteur d'écran reste une validation humaine distincte. |
| Matrice responsive sans contrôle inaccessible | Démontré automatiquement | `game-screens-responsive.spec.ts`, `accessibility-display.spec.ts` et `production-matrix.spec.ts`. |
| Clone propre et assets sur le déploiement | Démontré | Le job `clean-room`, `test:assets-clean`, `assets:verify:dist` et `test:deployed-assets` vérifient le clone, le build et les 187 fichiers servis par Vercel. |
| Falsification de progression impossible | Démontré automatiquement | Tests d'autorité, de ciblage forgé et tests DB/RLS, notamment `authorityRunEngine.test.ts` et `database.test.ts`. |
| Sauvegarde atomique, idempotente et récupérable | Démontré automatiquement | `runSaveRecovery.test.ts`, `runFinalization.test.ts` et tests RPC sur une base locale réelle. |
| Règles affichées alignées sur les handlers | Démontré automatiquement | Contrats de parité, règles versionnées et `i18nContract.test.ts`. |
| Documentation d'exploitation et de confidentialité à jour | Démontré côté dépôt | `operations`, runbooks, sauvegarde, release/support et contrat légal sont reliés et testés. Les autorisations juridiques externes restent un gate distinct. |

Les dix critères techniques sont donc **démontrés**. Une release reste soumise aux
preuves humaines et externes listées en fin de document.

## Preuves à consigner dans la fiche de release

### Trois CI consécutives — validé

Conserver les trois URL GitHub Actions, leur commit et la conclusion de chacun. Les
trois exécutions doivent inclure les jobs `validate`, `e2e`, `database` et
`clean-room`; une annulation ou un rerun partiel remet le compteur à zéro.

### Daily E2E réel — validé

Le scénario doit créer un compte de test par l'interface, ouvrir le Daily depuis le
menu, accepter uniquement la seed/difficulté reçues du serveur, démarrer la
tentative autoritaire puis prouver que l'accès suivant reprend la même run. Il est interdit
d'importer `runStore`, d'appeler `setState/getState` ou d'écrire directement dans
le stockage navigateur pour franchir une étape.

### Revue accessibilité humaine — complément non automatisable

Consigner appareil, OS, navigateur, lecteur d'écran, commit, parcours et résultat
pour NVDA + Firefox et VoiceOver + Safari/iOS. Tout blocage clavier, focus perdu,
annonce absente ou ordre de lecture empêchant la progression bloque la release.

### Déploiement candidat et assets — validé automatiquement

`npm run test:deployed-assets` télécharge les 187 fichiers du manifeste depuis
`DEPLOYMENT_URL` (Vercel production par défaut) et compare leur taille exacte. La
fiche de release conserve l'URL testée ; l'artefact ne doit pas être reconstruit
après validation.

## Gates externes supplémentaires

Même après les dix critères techniques, la bêta publique reste bloquée par les
points ouverts de `legal-and-privacy.md` : analyse juridique France/UE, canal de
support publié et clarification écrite de l'autorisation d'utiliser la propriété
intellectuelle Riot. Ces preuves ne peuvent pas être remplacées par un test local.
