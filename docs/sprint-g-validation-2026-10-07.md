# Sprint G — validation du 7 octobre 2026

## Périmètre et historique

Base commune : `origin/dev` à `98bcc43b30d7bd741d99b9ee1e8224f57898acdc`.
Les six branches de tâche sont réunies par des merges sans squash dans
`feat/sprint-g-integration`. Les corrections transversales de contrats, types,
rollback et performance sont des commits distincts sur l'intégration.

| Tâche | Branche depuis dev | Commits de sous-tâches | Dernier commit |
| --- | --- | ---: | --- |
| P2-CI-02 | `feat/sprint-g-ci-gates` | 5 | `075eb7f` |
| P3-PROD-01 | `feat/sprint-g-run-history` | 5 | `65638ee` |
| P0-I18N-01, preuve automatique | `feat/sprint-g-i18n` | 1 | `194b711` |
| P3-PROD-03 | `feat/sprint-g-pwa` | 4 | `48c9f2c` |
| P3-PROD-04 | `feat/sprint-g-content-gate` | 6 | `dab2c7c` |
| P3-PROD-05 | `feat/sprint-g-patch-notes` | 9 | `8cbf68d` |

Le sixième commit de contenu sérialise les simulations lourdes pour éviter les
faux timeouts dus à la contention CPU. Les seuils restent inchangés.

## Comportements livrés

- CI répartie entre statique, unités/couverture, sécurité, build/assets, DB,
  navigateur et clean-room ; la commande `npm run check` reste disponible.
  Le transfert du build est signé et vérifié pour le même SHA/run/attempt.
  Les checks `validate`, `database` et `e2e` agrègent strictement les nouvelles
  gates pour satisfaire les protections GitHub existantes sans les modifier.
- Historique filtré côté serveur, labels de comparaison, curseur préservant les
  microsecondes, index mesuré, détails/équipe chargés à l'ouverture et diagnostics
  de rejet limités au propriétaire ou à un administrateur reconnu côté serveur.
- Contrats FR/EN et parcours desktop/mobile étendus aux nouveaux écrans et textes.
- PWA installable en ligne conformément au choix utilisateur : manifeste/icônes,
  aucun service worker/cache applicatif/offline shell. Le départ connecté hors
  ligne échoue avant consommation d'une tentative. Une session invitée déjà
  chargée conserve son comportement existant.
- Admission de contenu : support réel, traductions, hash du moteur courant,
  artefacts de difficulté et intégrité des bundles de replay conservés.
  Aucun contenu ou réglage de gameplay ajouté dans ce sprint.
- Publications bilingues versionnées, page permanente et résumé non bloquant,
  lecture locale invitée ou synchronisée par compte. Un changement de SHA seul
  ne crée pas de publication ni de notification.

## Preuves locales

Environnement Node 24 et dépendances du lockfile. Détails complémentaires :
`docs/ci-gates-validation-2026-10-07.md`, `docs/run-history-cursor-index.md`,
`docs/content-admission.md` et `docs/sprint-g-i18n.md`.

- `npm run balance:check` : artefacts v15–v21, Early Top, matrice de combat,
  économie sur 1 000 seeds et calibration reproduits ; 141 tests/31 fichiers passent.
- `db:reset` local puis lint/security/advisors/indexes/migrations/types : passent ;
  62 migrations, dernière `20261007170953`. Types générés et contrôle de dérive passent.
- Suite DB découverte : 91 tests/16 fichiers passent sur les vraies API/SQL locaux.
- Rollback applicatif : ancien client `85fc6bc1f9ea17b62103d0a85a2bdfe6b5bacd45`,
  avec ses dépendances historiques isolées, 8 tests réels passent contre le schéma actuel.
- Statique : format, ESLint, CSP, types application/scripts/E2E, contrats de
  release et 122 tests de contenu/traduction passent.
- Unités/couverture : 2 163 tests passent, 47 tests DB réservés à leur gate sont
  ignorés ; les seuils globaux et par module critique passent sans abaissement.
- Sécurité : aucune vulnérabilité npm haute ou critique ; contrôle des assets
  depuis un build propre et vérification du build de production passent.
- Navigateur source : 60 autres scénarios passent dans la suite complète ; après
  correction de la connexion PostgreSQL des fixtures, les deux parcours connectés
  Daily/Sprint G passent également contre Supabase local.
- Production configurée avec les variables publiques Supabase locales et le SHA
  complet `3e5b803bfd4643b7678cb41ae059054c4cf18493` : 588 113 octets JS gzip
  au total (10,89 % de marge), 214 976 initialement et 219 022 pour Auth ; tous les
  budgets globaux, par chunk et assets passent.
- Preview mobile : cinq mesures Pixel 5, CPU ×4 et réseau 1,6 Mbit/s/150 ms ;
  p75 LCP 1 668 ms, CLS 0 et INP 104 ms, tous sous les plafonds inchangés.
- Matrice production : Chromium, Firefox et WebKit desktop/mobile passent
  (6 scénarios). Le lancement Firefox local a nécessité un `XUL_APP_FILE`
  temporaire pour contourner un refus d'accès au profil ; aucun changement
  d'application ou de configuration du projet n'a été nécessaire.

La commande globale a passé ses gates statique/unités/sécurité/assets ; son build
a d'abord dépassé l'ancien plafond JS. La gate build/budgets a ensuite été relancée
et passe avec les plafonds explicitement autorisés par l'utilisateur.

La gate connectée dédiée impose désormais `E2E_REQUIRE_CONNECTED=1` : un export
incomplet de credentials ou une cible non locale échoue au lieu de sauter le
parcours Sprint G. Les deux parcours connectés passent avec cette exigence active.

Les fixtures d'historique vérifié du test navigateur sont des résultats stockés
synthétiques servant à tester la lecture/les filtres, pas une preuve de replay
administrativement validé. La gate de replay et ses tests restent indépendants.

Les requêtes d'historique sont importées à la demande et conservent leur gate de
couverture critique (100/97/100/100). La décision utilisateur autorise un plafond
JS global de 660 000 octets gzip et initial de 220 000 octets. La marge globale
minimale de 10 % (total maximum 594 000 octets), les budgets par chunk, Auth,
assets et Web Vitals sont conservés. La mesure inclut tous les fichiers copiés
en fin de build et le SHA complet. Voir `docs/frontend-performance.md`.

## Conditions restantes

`P0-I18N-01` reste ouvert : un audit humain desktop/mobile avec lecteur d'écran sur
la preview du SHA candidat est requis. Les tests automatisés ne ferment pas ce P0.
La bêta reste bloquée selon `release:readiness:check` et les autres gates déjà ouvertes.

Les trois migrations nouvelles ont été appliquées uniquement à la base locale :

- `20261007170143_run_history_rejection_details.sql`
- `20261007170158_player_patch_note_read_state.sql`
- `20261007170953_run_history_cursor_index.sql`

La validation locale n'applique aucune migration distante. Les nouvelles RPC et
la synchronisation du marqueur de lecture nécessitent ces migrations sur la base
cible ; le fallback de lecture locale reste utilisable avant leur application.

La PR cible `dev`. L'ouverture/push et la CI distante sont vérifiés séparément des
preuves locales. Aucun merge ou déploiement Supabase n'est effectué dans ce sprint.
