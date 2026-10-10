# Validation locale P2-CI-02 — 7 octobre 2026

La commande `check` conserve les contrôles locaux et les gates spécialisées.
Le workflow expose `static`, `unit`, `security`, `build/assets`, `DB`, `browser`
et `clean-room`. Les contrats de release suivent ces noms ; les required checks
pour fusionner les tâches restent différés selon la décision du backlog.

Validations effectuées sur la branche `feat/sprint-g-ci-gates` avec Node 24 :

- Dix suites de régression liées aux workflows, types, assets, release et
  transfert signé : **55 tests réussis**. Elles couvrent notamment SHA/run/dépôt
  incorrects, contenu altéré/ajouté/supprimé, manifeste falsifié, substitution
  de clé, symlink et indépendance de `clean-room`.
- `typecheck:scripts` et `typecheck:e2e` réussis. `typecheck:strict` réussit avec
  les quatre diagnostics upstream exactement recensés par la politique existante.
- `check:build` réussit : bundle authority, 227 assets Riot, deep links, CSP,
  réponse 404 réelle et budgets de performance. La marge JS globale mesurée
  est 10,76 % ; l’entrée est à 214 524 octets gzip pour une limite de 215 000.
- Le transfert CLI `pack` → `restore` d’un vrai `dist`, signé avec le SHA du
  checkout, puis la matrice `chromium-production` réussissent : un scénario
  Playwright passé, en servant le build vérifié sans reconstruire.
- `test:assets-clean` réussit avec 773 fichiers de dépôt copiés dans un
  répertoire temporaire, sans réutilisation de `dist`.
- `actionlint` 1.7.12 (archive officielle vérifiée par SHA-256) valide le
  workflow complet ; le YAML expose bien les sept jobs. `git diff --check`
  ne relève pas d’erreur.

Le workflow exige une signature Ed25519, la clé publique issue de la sortie du
job producteur, l’ID immuable du même run et un digest de téléchargement valide.
Le fichier caché `.vite/manifest.json` fait partie du bundle et de l’inventaire
signé. Aucun cache applicatif, téléchargement inter-run, clé privée persistante
ou permission OIDC supplémentaire n’est utilisé.

Ces preuves sont locales. Le job `clean-room` entier avec Supabase/Docker, les
navigateurs Firefox/WebKit et le transport réel des artifacts GitHub n’ont pas
été exécutés par cette validation de tâche. Le sprint intégré doit encore
rejouer les gates locales sur son propre SHA et ses sources combinées ; aucune
preuve de déploiement ou de readiness bêta n’est produite ici.
