# Validation ARCH-S5 — 13 octobre 2026

## Périmètre

Base `dev` : `70b0a6148a561674e296478fa85fd907255fc0a0` (ARCH-S4 fusionné).
Branche `feat/arch-s5-artifacts-css-debt`, PR vers `dev`. ARCH-16 protège la
provenance et la rétention des artefacts, ARCH-17 rationalise les styles sous
preuve visuelle, ARCH-18 audite les dépendances et rend le contrôle de sécurité
strict sur les rapports incomplets.

L'application et les patch notes FR/EN deviennent `0.2.6`, publication 11.
Le moteur reste `run-engine-0.2.5`, clé gameplay 24, hash
`9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa`.
Les identités Daily/progression/commandes/catalogue restent `15/3/2/2`.
Le registre et ses 24 bundles, les migrations et le checkpoint de rollback
restent inchangés. Aucune migration nouvelle n'est nécessaire pour cette tranche.

## Contrats

| Tranche | Contrat | Vérification |
| --- | --- | --- |
| ARCH-16 | [Artefacts générés](generated-artifacts.md) | Vérification en lecture seule, dérive, archives et reproduction conditionnelle |
| ARCH-17 | [Maintenance CSS](css-maintenance.md) | Inventaire, cascade, parité visuelle et accessibilité |
| ARCH-18 | [Dépendances](dependency-audit.md) | Usages, versions verrouillées, patch Auth et rapports d'audit invalides |

Les rapports JSON, traces et captures temporaires restent dans les répertoires
ignorés. Le backlog actif conserve les décisions et les liens vers les preuves.

## Baseline mesurée

Le clone de référence indépendant utilise `git clone --no-local`, le SHA de base,
Node 24.19.0 et npm 11.17.0. Il ne contient ni `node_modules`, ni `dist`, ni cache
Data Dragon, ni état Supabase local. Le cache npm dédié est vide avant `npm ci`.
L'installation complète prend 4,37 s et `npm run check:build` 6,05 s, mesurés par
`/usr/bin/time -p`. Ces mesures locales isolées ne constituent pas un benchmark
statistique. L'installation du worktree avec cache npm existant prend 3,26 s.

Le clone indépendant ARCH-S5, au candidat `f0a2907` avant la clôture documentaire,
repart aussi sans ces répertoires ni cache npm : `npm ci` prend 3,18 s et
`npm run check:build` 5,62 s. Les contrôles des artefacts avant/après réussissent
et les 24 SHA-256 des bundles sont identiques à la base `70b0a614`. Git reste
propre. Le build local invité sans variables privées ne prouve pas une connexion
Supabase ; les trois parcours connectés sont validés séparément sur la DB locale.

| Mesure | Avant (dev) | Après |
| --- | ---: | ---: |
| Dépendances directes runtime / dev | 8 / 21 | 8 / 21 |
| Entrées du lock / noms uniques | 284 / 267 | 284 / 267 |
| Entrées npm publiques | 40 | 40 |
| Source TS/TSX / imports internes | 429 / 1 819 | 429 / 1 819 |
| Imports totaux / de types | 2 001 / 457 | 2 001 / 457 |
| Consommateurs du barrel services / violations | 0 / 0 | 0 / 0 |
| JavaScript gzip | 621 103 octets | 621 519 octets |
| Chargement initial / auth gzip | 220 440 / 225 220 octets | 220 434 / 225 215 octets |
| Assets déployables | 7 992 356 octets | 7 994 061 octets |
| Bundle authority courant | 861 126 octets | 861 126 octets |
| Déclarations CSS / règles / `!important` | 8 205 / 2 245 / 69 | 8 202 / 2 247 / 69 |
| Tokens racine | 58 | 63 |

Les budgets v9 restent inchangés : 11,21 % de marge JavaScript, au-dessus des
10 % requis. L'augmentation de 416 octets gzip inclut les nouvelles patch notes
FR/EN ; ce lot ne prétend pas réduire le bundle. Les six stores de la composante
cyclique existante restent suivis par le checker de frontières métier.
Le tableau compare des builds avec `commitSha: local` ; le clone avec le SHA
complet mesure 7 994 131 octets déployables, soit 70 octets de métadonnées en plus.

La référence CI est le run
[38437033958](https://github.com/Thanan71/LolRogue/actions/runs/38437033958),
SHA `e517370b25f1249c8d906d808e010fa22d5c1826`, depuis fusionné. Durées complètes
des jobs, installation comprise : static 27 s, unit 538 s, security 19 s,
build/assets 77 s, DB 178 s, browser 868 s, clean-room 755 s. Le parallélisme,
les caches et les runners partagés interdisent d'attribuer une différence de
temps isolée à la seule modification de code.

## Vérifications

| Gate | Résultat |
| --- | --- |
| `npm run check` | PASS ; 3 157 tests / 277 fichiers, 86 tests ignorés dans la suite globale ; gates DB/balance/connectés exécutés séparément ; couverture et budgets verts ; 459,81 s |
| DB locale migrée, types et sécurité | PASS, 130 tests / 17 fichiers, aucun skip ; 67 migrations, dernière `20261011134126` ; 65,24 s |
| `npm run balance -- check` | PASS ; cohortes historiques, 7 560 combats, 1 000 seeds carte, trois versions Veigar à 180 runs appariées puis 148 tests / 31 fichiers |
| `npm run typecheck:strict` | PASS ; quatre diagnostics upstream autorisés inchangés |
| Comparaison CSS avant/après | PASS, deux matrices de 3 parcours ; 42 PNG et relevés JSON conservés sous `/tmp`, aucun asset dans les commits |
| Suite navigateur source | 72 scénarios : 71 PASS directs, 1 PASS après retry sur la sélection tactile à 320px ; cause et correctif du locator documentés, puis 10/10 sans retry ni trace |
| Parcours connectés | PASS, 3/3 sans retry ni skip : Daily, historique/patch notes, économie/reconnexion mobile |
| Matrice production locale | 4/6 PASS (Chromium et WebKit, desktop/mobile) ; les deux Firefox échouent au lancement du profil avant toute page |
| Clone neuf | PASS, installation et build indépendants, artefacts inchangés avant/après et 24 empreintes figées conservées |
| CI distante | Résultats et durées du SHA candidat consignés dans la PR ; les six projets navigateur restent obligatoires |

La limitation Firefox macOS est reproduite par un lancement `about:blank`
indépendant du projet : dossiers temporaires et profil persistant explicitement
créé avec droits 700 échouent avec « Could not find profile folder », bien que le
dossier existe avant/après. Aucun test, browser ou budget n'est retiré ; la matrice
Linux CI demeure la preuve exigée pour les deux variantes Firefox.

Le test tactile suivait les positions `nth(0)` / `nth(1)` alors que le catalogue
public remplaçait l'offre initiale : le premier locator désignait finalement un
autre champion que celui effectivement choisi. Le défaut initial est reproduit
2/10 sans trace ; les IDs figés et le feedback après chaque tap passent 10/10.
Les composants, stores, CSS, retries et délais restent inchangés. Le parcours
complet du SHA corrigé est également requis par la CI source et clean-room.

Le déploiement et l'application de migrations distantes restent des opérations
distinctes de cette validation. La décision de désactiver une ancienne version
authority reste régie par [le contrat de versioning](authority-versioning.md).
