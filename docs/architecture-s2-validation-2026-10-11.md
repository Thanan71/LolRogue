# Validation ARCH-S2 — Configuration et déploiement

Validation locale du 11 octobre 2026, sous Node 24.19.0, à partir de `dev`
`e296e50036e7708cb4c241202a3e6c77505f3334` après la fusion de la PR #214.
Le périmètre couvre ARCH-05, ARCH-06 et ARCH-07. La PR vers `dev` contient
les résultats CI du commit final ; ces preuves locales ne valent pas déploiement.

## Configuration commune

Les références publiques et le contrat environnement sont centralisés dans
`scripts/lib/environment-config.mjs`. Les builds locaux sans Supabase, les
previews dev/PR et la production main sont testés avec les erreurs de branche,
SHA, clé absente, rôle privé et paire URL/clé d'un autre projet. La config Vite
n'expose que cinq variables publiques ; Vitest fonctionne indépendamment des
politiques de déploiement et conserve l'option E2E existante.

54 tests de matrice de configuration et 5 tests de contenu E2E passent.
Le build réel Preview dev a été exécuté avec une paire publique globale de
production contradictoire, une clé `service_role` factice non publique et une
variable privée préfixée `VITE_`. Résultat : LolRogueDev dans les fichiers
navigateur, aucune valeur privée injectée, aucun appel distant. `check:build`,
les contrôles d'assets et tous les budgets passent avec 316 fichiers et
7 977 268 octets.

## Commandes DB et Edge

Les tests de plans, processus factices et dépôts Git temporaires couvrent
main/dev/feature/detached HEAD, cible manquante ou incorrecte, lien incorrect,
absence de confirmation, changement du lien entre deux étapes et arrêts en cas
d'échec du déploiement. La branche et la ref sont contrôlées avant toute opération
distante ; la ref est aussi passée au CLI natif et son profil cloud est fixé.

Les redirections Git, Supabase et libpq ne peuvent pas remplacer la cible validée.
Les URLs de sauvegarde distantes doivent identifier le même projet, directement
ou via le pooler. Les paramètres TLS sûrs restent acceptés. Le mode local exige
une stack Docker locale sur loopback et garde `database reset` exclusivement local ; le runner DB
et les wrappers locaux vérifient leur environnement avant leur premier effet.
Les contextes Docker explicites et persistants sont contrôlés ; les contextes
Desktop/Colima locaux restent acceptés. Docker est un prérequis existant : ce
sprint n'ajoute pas de support Podman et refuse ses redirections explicites.
300 tests ciblés passent sur 9 fichiers. La revue indépendante a rejoué
278 tests et les reproductions des redirections. Ces tests n'utilisent ni
Docker, ni réseau, ni base distante. Les fixtures de confirmation distante
injectent leur environnement ; 202 tests CLI/gardes passent aussi avec les
variables loopback `SUPABASE_DB_URL` et `VITE_PUBLIC_SUPABASE_URL` du job CI.

L'ordre backend reste validation authority, liaison, preview migrations, Edge,
frontend compatible, migrations, manifeste et promotion Production. Toute erreur
interrompt la chaîne. Les contrats de rollback et les required checks sont
conservés. Les commandes et leurs prérequis figurent dans
[environment-contract.md](environment-contract.md) et [script-cli.md](script-cli.md).

## Extraction Vite et Vitest

Le build de référence et le build après extraction ont utilisé le même SHA
explicite et la même configuration. Les 316 fichiers produits sont identiques
octet par octet : chemins, tailles et SHA-256, incluant chunks navigateur,
assets Riot, fichiers PWA, preload de locale, HTML et identité JSON.
Le build après intégration du module commun reste également strictement identique
sur cette configuration locale, même avec des sentinelles privées dans le
processus et le fichier du mode.

L'empreinte SHA-256 du manifest `.vite/manifest.json` reste
`63dd16e164fa98816a3759cef8b9342924a64f0e41c9a3c2f8c1d5ef20cf6cce`.
Les objets Vitest complets avant/après extraction, en modes normal et couverture,
sont égaux : seuils, exclusions, reporters et timeout. 47 tests ciblés des plugins,
de la politique et des contrats existants passent. `publicDir: false`, l'ordre
catalogue/identité/React/PWA/Riot et les chemins des assets sont conservés.

Les vérifications du build servent les routes profondes, vérifient CSP/PWA et les
assets manquants. Les changements ultérieurs des chunks liés aux patch notes
`0.2.3` et aux valeurs publiques de la preview sont des différences attendues,
distinctes de l'extraction qui a été comparée à entrées identiques.

La copie temporaire du test de build propre inclut désormais `tooling/`, requis
par les imports des plugins extraits. Le script `test-clean-asset-build.mjs`
passe directement avec 877 fichiers du dépôt copiés dans un répertoire neuf.

## Vérifications globales

- `npm run check:static` passe : inventaire, format, lint, styles CSP, trois
  surfaces TypeScript, contrat Node et contrôles de contenu (133 tests).
- `npm run check:unit` passe : 2 835 tests, 265 fichiers, 83 tests conditionnels
  ignorés dans 9 fichiers. Les tests DB vivants restent une gate CI distincte.
- Couverture V8 : statements 86,16 %, branches 78,14 %, fonctions 91,12 %,
  lignes 88,33 % ; aucun seuil ou périmètre de couverture abaissé.
- `npm run typecheck:strict` passe avec les quatre diagnostics upstream exacts
  déjà autorisés ; `npm run check:security` ne signale aucune vulnérabilité
  haute ou critique.
- Le build Preview réel décrit plus haut passe `npm run check:build`.
- Graphify a été actualisé en extraction AST `--code-only`. L'inventaire garde
  40 entrées npm publiques et recense 69 commandes canoniques dans cinq groupes.

## Périmètre de publication

La version applicative et la note FR/EN passent à `0.2.3`. Le moteur courant reste
`run-engine-0.2.0` ; les registres, hashes, bundles historiques, règles de gameplay,
artefacts de balance, migrations SQL et images ne sont pas modifiés.
Aucune activation métier, migration distante ou publication backend n'a été
réalisée. Les preuves humaines et distantes de sortie bêta restent requises.
