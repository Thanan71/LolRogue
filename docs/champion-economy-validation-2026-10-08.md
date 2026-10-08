# P3-ECO-01 — validation du 8 octobre 2026

## Périmètre

Branche `feat/p3-eco-01-champion-economy`, créée depuis `dev` à `1fb35df2`.
Contrat produit v4, économie/catalogue v1, moteur `run-engine-v21` et gameplay
ruleset 21. Le hash de gameplay reste
`9a83e7631f67d28e47c2cd1e8a0237d1009e8d53416aa97525ee088a1d5a38a6`.
Les commits séparent contrat, policies, services, replay, accès, audit, UI,
migration, protections asynchrones, CI et preuves navigateur.

Tous les comptes, wallets et changements d'horloge utilisés par ces tests sont
locaux et jetables. Aucun schéma, flag, wallet ou deployment distant n'est modifié.
La migration laisse l'économie OFF. Le backlog de bêta reste ouvert pour les
preuves humaines et externes ; cette tâche ne les clôture pas.

## Contrôles terminés

| Contrôle | Résultat | Portée |
| --- | --- | --- |
| `npm run check` | PASS | Format, lint, CSP, types app/scripts/E2E, Node 24, documentation de readiness, contenu, couverture, audit, assets propres et build |
| Suite complète avec couverture | 241 fichiers, 2 268 tests PASS ; 9 fichiers / 80 tests DB ignorés hors runner dédié | Aucun seuil réduit |
| Couverture | statements 85,29 %, branches 76,84 %, functions 89,47 %, lines 87,48 % | Seuils globaux et par module respectés |
| Base réelle locale | 17 fichiers / 124 tests PASS, dont 18 économie | RLS A/B, 399/400/401, concurrence, rollback, idempotence, reward verified, bonus, flag OFF, maîtrise 183 |
| Schéma et exploitation locale | 63 migrations, dernière `20261008171535`, lint 0, grants/advisors/indexes PASS | Les exceptions documentées sont bornées ; types Supabase générés dans la branche |
| Assets | Clean build PASS ; 227 assets locaux vérifiés | Aucun téléchargement Riot nécessaire pendant le build |
| Dépendances | Aucun finding high/critical | Lockfile courant, Node 24 |
| Régressions ciblées | Changement A→B pendant last-login/hydratation, refresh tardif après achat, timeout 15 s et retry UUID, Daily sans catalogue | Aucune balance/propriété de l'ancien compte ne remplace le compte actif |
| UI | 16 tests, 2 parcours mobiles FR/EN au clavier, Axe sans violation dans les dialogues | Confirmation de prix capturé, montant manquant, bouton pending, filtres et focus |
| Parcours connecté source | PASS, 30,4 s | Auth réelle, combat UI, RPC et Edge local réels ; aucun résultat verified injecté |
| Upgrade après restauration | PASS | [Preuve anonyme](restore-drills/champion-economy-2026-10-08-local.json) : schémas public/private/Auth/history, propriétaires et deux comptes restaurés, maîtrise 183 inchangée, 10 legacy chacun, wallets 0, seconde activation sans doublon |
| Kill-switch et nouvelle identité | PASS | Après activation : 0 achat, 3 gratuits +5 rotation ; arrêt conserve les données et la coupure initiale |
| Réconciliation locale | PASS | `economy:audit -- --local` : consistent=true, 0 divergence, 0 gain suspect, aucun changement de données |
| Ancienne application sur nouveau schéma | 8 tests PASS | SHA historique `85fc6bc1f9ea17b62103d0a85a2bdfe6b5bacd45`, sans reset du schéma lors du probe |
| Suite générale | 61 scénarios PASS sur deux profils locaux | 59 sur profil sans Supabase, 2 fixtures de synchronisation sur profil public local ; la passe CI complète utilise le public local, flag OFF |
| Production locale connectée | PASS, 34 s au SHA `848886afaaf28e3c3644afb1152ac6266cdea72a` | Identité de build contrôlée ; vraie auth, RPC/Edge, 10 portraits, mobile/clavier et deux transitions de période |
| Matrice production | 6/6 PASS, 29,5 s sur le même build | Chromium, Firefox et WebKit, desktop/mobile ; flag OFF public déterministe |
| Web Vitals laboratoire | PASS, p75 sur 5 échantillons | Pixel 5, CPU ×4, 150 ms / 1,6 Mbit/s : LCP 1 612 ms, CLS 0,0812, INP 88 ms ; budgets 2 500 / 0,1 / 300 |

Le parcours connecté joue Darius en rotation et Garen, gagne une vague puis
abandonne. Le serveur rejoue cette attempt et retourne une vague gagnée, zéro
biome terminé et 25 Éclats. La maîtrise augmente de 7 Candies pour Darius et
6 pour Garen. Le test prouve ensuite l'expiration et le refus serveur du starter
verrouillé, tout en conservant la tentative passée. Une correction **de fixture**
auditée de 375 permet d'atteindre 400 sans fabriquer un faux replay.

L'achat réel au clavier sur 390 px débite une fois, rend Darius immédiatement
sélectionnable et laisse exactement trois lignes de ledger : `+25`, `+375`,
`-400`. Recharge, déconnexion/reconnexion et seconde transition hebdomadaire
conservent la propriété et les Candies. Le montant de fixture n'est ni un gain
de gameplay, ni une distribution aux joueurs.

Les sorties de tests conservent un JSON `verified-champion-economy.json` et une
capture mobile. La preuve production exige en plus le SHA de
`deployment-identity.json`, les dix portraits chargés et l'absence de recouvrement
par badges/actions. Les credentials privilégiés restent dans Node et ne sont
jamais injectés dans le navigateur.

## Budget du build

Mesure du passage complet local :

| Mesure | Octets | Plafond |
| --- | ---: | ---: |
| JavaScript total gzip | 597 273 | 670 000, avec 10 % de marge obligatoire |
| Chargement initial gzip | 216 557 | 220 000 |
| Route Auth gzip | 220 603 | 225 000 |
| Plus gros chunk brut | 463 747 | 560 000 |

La marge globale vaut 10,85 %. L'autorisation utilisateur augmente seulement
le plafond total de 660 000 à 670 000 ; les limites initial/Auth, par chunk,
assets et Web Vitals restent inchangées. Le rapport final est produit sous
`performance-report/bundle-report.json` avec le SHA fourni au build candidat.

## Profils de validation du candidat

La restauration est bornée aux quatre schémas de l'application et Auth ; elle
ne prétend pas exercer les schémas internes Realtime/Storage ni une restauration
hébergée de production. Après le drill et chaque parcours économique, la base
locale retrouve le schéma courant, le flag OFF, l'horloge d'origine et aucune
fixture économique restante. La restauration distante de P2-OPS-01 reste ouverte.

La suite générale utilise l'URL et la clé publique du Supabase local jetable,
flag OFF, pour rester indépendante du projet distant tout en conservant les
fixtures de synchronisation connectée. Les trois fichiers stricts sont exclus de
la générale et exigent `E2E_REQUIRE_CONNECTED=1` ainsi que les credentials de la
base locale ; ils échouent lorsque ceux-ci manquent. La matrice historique stubbe uniquement la lecture
publique du flag OFF ; elle ne valide pas les wallets. Le parcours économie ON
de production utilise les vrais RPC, tables et replay Edge de la base locale.

La preview compilée utilise uniquement l'URL et la clé publique locales. Le test
garde service-role/DB dans Node ; le serveur preview n'en hérite pas. Son JSON
conserve le SHA observé dans `deployment-identity.json`. Les captures source Vite
ne constituent pas une preuve d'assets : les portraits sont vérifiés sur le build
de production avec les fichiers Riot effectivement copiés.

Le dist comporte 307 fichiers et reste identique avant/après la matrice et les
mesures, empreinte globale
`6ad7d6df07be40cc0adfd4eb46afac336cb144085033c5268ca2a0c045c050e4`.
Les rapports incluent 13 chunks et 236 242 octets transférés pour Auth après
interaction, sans chargement différé interdit. Les changements ultérieurs de
documentation ou de configuration CI ne modifient pas le source de l'application.

Firefox macOS utilise un fichier temporaire `application.ini` et un lien vers
son `omni.ja` d'origine via `XUL_APP_FILE`, pour contourner le refus local d'accès
au dossier de profil. Le moteur Playwright 1543 et le dépôt ne sont pas modifiés.
La CI Linux utilise le lancement standard ; cette preuve locale ne prétend pas
réparer les permissions du lancement macOS standard.

Le build connecté mesure 597 501 octets gzip au total, 216 830 initiaux et
220 875 pour Auth, avec 10,82 % de marge et 7 892 045 octets d'assets. Le profil
local connecté explique l'écart avec la mesure `npm run check` ci-dessus.

## Rollout restant

Appliquer la migration, déployer `verify-run` et l'application sur la cible
distante, puis valider les smoke tests et l'audit avant toute activation. Procédure
et kill-switch : [champion-economy.md](champion-economy.md). Les comptes existants
gardent le roster par `legacy_grant` à la première activation ; aucune conversion
historique de Candies n'est faite. Cette livraison n'annonce ni production active,
ni bêta publiable, ni merge de la PR.
