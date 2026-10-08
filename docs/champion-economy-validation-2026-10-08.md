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

## Contrôles complémentaires du candidat

La validation avant PR comprend également la restauration représentative suivie
de migration, l'audit local sans écriture, le probe de rollback de l'ancienne
application, la suite générale, le parcours connecté sur preview de production
locale et la matrice Chromium/Firefox/WebKit desktop/mobile. Les résultats de
ces contrôles doivent être consignés avant de clôturer le checklist archivé.

La suite générale impose un profil public Supabase vide pour rester indépendante
du projet distant. Les stricts connectés exigent les credentials de la base locale
et échouent lorsqu'ils manquent. La matrice historique stubbe uniquement la lecture
publique du flag OFF ; elle ne valide pas les wallets. Le parcours économie ON
de production utilise les vrais RPC, tables et replay Edge de la base locale.

## Rollout restant

Appliquer la migration, déployer `verify-run` et l'application sur la cible
distante, puis valider les smoke tests et l'audit avant toute activation. Procédure
et kill-switch : [champion-economy.md](champion-economy.md). Les comptes existants
gardent le roster par `legacy_grant` à la première activation ; aucune conversion
historique de Candies n'est faite. Cette livraison n'annonce ni production active,
ni bêta publiable, ni merge de la PR.
