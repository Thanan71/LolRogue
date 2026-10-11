# Commandes de maintenance

La CLI utilise Node 24 et les dépendances verrouillées du dépôt. Elle regroupe
les commandes dans cinq domaines : `balance`, `database`, `assets`, `release`
et `testing`. Les scripts métier continuent de produire les mêmes artefacts.

```bash
node scripts/cli.mjs --help
npm run balance -- --help
npm run database -- reset --help
```

Les options sont validées avant l'exécution. Une commande inconnue, une valeur
manquante ou une option incompatible produit une erreur JSON sur stderr et un
code de sortie non nul. `--` sépare les arguments transmis à npm ; les sous-commandes
n'ont pas besoin d'un deuxième séparateur.

## Équilibrage et versions

```bash
npm run balance -- baseline generate
npm run balance -- baseline generate --engine v22
npm run balance -- baseline generate --engine 0.2.0 --output /tmp/baseline.json
npm run balance -- baseline check --all
npm run balance -- artifacts check
npm run balance -- check
```

La version par défaut provient de l'unique entrée `current` de
`config/authority-versions.json`. `--engine` accepte les versions courtes et
les identifiants complets du registre. `--all` vérifie les artefacts conservés
dans l'ordre du registre ; pour les baselines authority, cela inclut les moteurs
historiques et le moteur courant. Il est incompatible avec `--engine`.
Aucun hash historique n'est recalculé ou remplacé.

La table d'équivalence indique les moteurs fixés des alias retirés. Pour
reproduire leur comportement, utiliser l'appel canonique avec le même
`--engine`. La CLI refuse les options dupliquées.

Les campagnes Early Top et affordability correspondent à des protocoles
historiques précis. Leur génération nécessite une version prise en charge ;
une demande visant le moteur courant échoue explicitement si ce protocole
n'existe pas pour lui.

```bash
npm run balance -- early-top generate --engine v21
npm run balance -- early-top check --all
npm run balance -- early-top affordability generate --engine v18
npm run balance -- veigar check --all
```

## Lire, générer et confirmer

`--dry-run` affiche un plan JSON validé sans lancer ses opérations. Les commandes
qui détruisent des données locales ou modifient un service distant exigent
`--yes`. L'aide de chaque commande indique son niveau de risque et ses options.

```bash
npm run database -- reset --dry-run
npm run database -- reset --yes
npm run database -- types check
npm run testing -- database --list
npm run assets -- verify
npm run assets -- verify --dist
npm run testing -- static
npm run testing -- unit
```

Le reset vise exclusivement Supabase local. Il refuse les options de ciblage
distant. `database types check` compare les types générés et formatés en mémoire
au fichier commité ; une divergence ne réécrit pas ce fichier. Les générateurs
écrivent uniquement lorsque leur commande de génération est choisie. La
vérification d'une baseline ne modifie pas son artefact.

Les commandes de génération acceptent aussi `--check` lorsque le script métier
le propose. Ce mode reproduit l'artefact sans le
réécrire et son plan indique `read-only`. `--check` et `--output` sont incompatibles.

```bash
# Depuis dev ou main uniquement :
npm run release -- deploy --dry-run
npm run release -- deploy --yes
```

Le déploiement contrôle la branche Git réelle. `dev` cible LolRogueDev et la
preview Vercel ; `main` cible LolRogue et la production Vercel. Une option de
branche ne peut pas autoriser un checkout différent. Les CLI et l'accès aux
projets sont vérifiés avant la publication. Supabase vient du lockfile ; Vercel
utilise la version épinglée déjà préparée dans le cache npm, en mode offline.

Préparer explicitement Vercel avant un déploiement :

```bash
npx --yes --package=vercel@59.11.7 vercel --version
```

Les sous-processus héritent de stdout et stderr. Un échec arrête la chaîne et
conserve son code de sortie ; SIGINT et SIGTERM sont transmis au processus actif.
Les commandes sont exécutées depuis la racine du dépôt, même si la CLI est
appelée par son chemin absolu depuis un autre dossier.

Les migrations distantes et le déploiement de `verify-run` contrôlent également
la branche réelle et le projet associé. Un `--project-ref` différent de celui de
`dev` ou `main` échoue avant toute opération. Pour une migration, `--preview`
exécute la prévisualisation Supabase sans appliquer de changement ; `--dry-run`
affiche seulement le plan de la CLI sans exécuter ses opérations.

```bash
# Depuis dev ou main, avec le projet correspondant :
npm run database -- migrate --project-ref <project-ref> --preview
npm run database -- migrate --project-ref <project-ref> --yes
npm run release -- edge deploy --project-ref <project-ref> --yes

# Base locale uniquement :
npm run database -- migrate --local --yes
```

## Inventaire et compatibilité

```bash
npm run scripts:inventory
npm run scripts:inventory:check
```

[L'inventaire lisible](script-inventory.md) relie les anciens noms aux appels
canoniques, à leurs propriétaires et à leurs appelants. Les preuves exactes sont
dans [l'inventaire JSON](scripts-inventory.json). Le snapshot initial conserve les
105 entrées, y compris `postinstall`, `prebuild` et `postbuild`. L'inventaire
comprend aussi les chaînes npm et les hooks implicites.

Les appelants actifs utilisent les groupes canoniques. Après leur migration et
les 18 checks verts de la [PR #213](https://github.com/Thanan71/LolRogue/pull/213),
72 alias ont été retirés : 40 entrées npm restent publiques. Ce choix préserve
les commandes usuelles, les hooks, les gates CI et les contrats de reproduction.
[Le manifeste de preuves](../config/script-alias-retirement.json) conserve le SHA
vérifié, les liens des checks et les références historiques autorisées.
L'inventaire refuse tout appel actif vers un alias retiré, sans imposer un plafond
artificiel au nombre de commandes.

`balance:repro` reste disponible pour les commandes de reproduction conservées
dans les artefacts de balance, et `authority:generate` pour les indications des
résolveurs générés. Les documents archivés et les artefacts figés conservent leurs
commandes historiques ; leur présence est distinguée des usages actifs.
