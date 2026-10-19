# Validation ARCH-S4 — 13 octobre 2026

## Périmètre et publication

Base `dev` : `e313c6f657d2662c9c327875463f16b40ddada20`. Branche
`feat/arch-s4-feature-modules`, PR vers `dev`. ARCH-12 à ARCH-15 séparent les
modules Daily, combat et sélection des champions, les composants partagés et les
unités synchrones d'exécution. Les façades historiques gardent les routes lazy et
leurs contrats publics. Les autres domaines restent dans leurs emplacements
actuels jusqu'à une tranche autorisée.

L'application et les nouvelles patch notes FR/EN portent la version `0.2.5`.
Le moteur courant devient `run-engine-0.2.5`, clé gameplay `24`, hash
`9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa`.
Daily/progression/commandes/catalogue restent `15/3/2/2`. Les 23 bundles historiques
gardent leurs octets, dont le bundle 0.2.0 devenu `replay-only`.

Le checkpoint applicatif `968c0b3ad3c2dfc3c2edffefe40e10aaebdeba5c` contient la
publication moteur compatible avant la migration UI. Le contrat de rollback le
référence avec le manifeste de 67 migrations, dernière version
`20261011134126`. Ce candidat technique est testé avec ses dépendances verrouillées
sur la DB locale migrée ; il ne désigne pas un déploiement de production sain.

## Contrats et preuves

| Tranche | Contrat | Preuves principales |
| --- | --- | --- |
| ARCH-12 | [feature-module-contract](feature-module-contract.md) | Port Daily injecté, réponses obsolètes, comptes A → B → A, rejets, filtres, signalements concurrents, StrictMode et démontage ; checker AST et composition unique |
| ARCH-13 | [feature-combat-contract](feature-combat-contract.md) | 28 tests de contrôleur, validation canonique des cibles, clavier, auto et vitesses ×1/×2/×3, timer annulé, completion/save et guard de navigation ; six parcours combat/carte réels |
| ARCH-14 | [feature-starter-contract](feature-starter-contract.md) | Préparation pure, catalogue filtré, accès/runes, Daily connecté/invité, retry, double clic et réponses obsolètes ; parcours FR/EN desktop/mobile |
| ARCH-15 | [engine-refactor-contract](engine-refactor-contract.md) | 75 fixtures avant extraction, 46 replays sérialisés et 23 digests historiques ; matrice 7 560 combats/runtime, cohortes 45 × 30, économie 1 000 seeds et Veigar 180 runs |

Les générateurs de cohortes acceptent l'identité semver et chargent son moteur figé.
Les anciens artefacts 0.2.0 restent reproductibles et immuables. Les contrôles CLI
sont détaillés dans [architecture-s4-cohort-cli-validation](architecture-s4-cohort-cli-validation.md).

## Vérification finale

| Gate | Résultat local |
| --- | --- |
| Static, format, lint, TypeScript, inventaire et contrats | PASS ; 133 tests de contenu |
| TypeScript strict | PASS, quatre diagnostics historiques inchangés |
| Sécurité dépendances | PASS, aucune vulnérabilité haute ou critique |
| DB locale migrée | PASS, 130 tests dans 17 fichiers, aucun skip |
| Rollback applicatif | PASS, 10 tests du checkout historique sur le schéma courant |
| Couverture unitaire finale | PASS, 3 097 tests dans 275 fichiers ; 86,35 % instructions, 78,68 % branches, 91,06 % fonctions, 88,40 % lignes |
| Navigateurs source | Les 69 scénarios sont couverts par la suite et les reprises ciblées ; anglais/storage 11/11, sauvegarde/rechargement 3/3, runs complètes 2/2 au premier essai |
| Navigateurs connectés | PASS, 3/3 sans retry, Daily/Sprint G/économie sur les services locaux réels |
| Matrice production locale | Chromium et WebKit desktop/mobile PASS ; Firefox ne démarre pas dans l'environnement macOS local, même après réinstallation du binaire |
| Performance mobile contrôlée | PASS, cinq échantillons Pixel 5, CPU ×4 et réseau 1,6 Mbit/s : P75 LCP 1 648 ms, CLS 0, INP 80 ms |
| CI et preview de la PR | Résultats distants du SHA final suivis dans les Checks de la PR |

Les fixtures navigateur restent aux frontières HTTP. Le catalogue public valide
est simulé dans les scénarios isolés ; la run complète sélectionne Warwick dans
une rotation officielle figée qui le contient. Les tests ne déverrouillent aucun
store. Les parcours connectés utilisent séparément le Supabase jetable local.

Le scénario économie accepte les deux routes valides après récupération d'un
reçu terminé : sélecteur ou GameOver pendant la récupération. Dans GameOver,
il conserve les assertions de reçu vérifié et d'absence de retry. Le garde de
route, la persistance et les assertions RPC/ledger/achat restent inchangés.

Les 86 tests ignorés de la suite unitaire nécessitent des credentials DB ; la
gate DB dédiée exécute séparément ses 130 tests sans skip. Le graphe AST final
contient 429 fichiers, 2 001 imports, 1 819 internes et 457 de types ; aucune
violation ni consommateur du barrel services, avec le même SCC de six stores.

Les seuils de couverture sont conservés. Le build final mesure 621 103 octets de
JavaScript gzip, 220 440 octets initiaux, 225 220 octets de route auth et
7 992 356 octets d'assets déployables. Le seul plafond global JavaScript passe de
690 000 à 700 000 octets (+1,45 %), avec la même marge minimale obligatoire de 10 %.
Le [justificatif](frontend-performance.md) conserve les protections asynchrones
partagées ; les autres plafonds restent identiques.

Les tests de lecture de source i18n/CSP et la couverture suivent les implémentations
déplacées, tout en exerçant les façades historiques. Trois tests jsdom ont un délai
de 15 secondes pour leur import initial sous instrumentation V8 ; leurs assertions
et les seuils globaux ne changent pas.

## Limites opérationnelles

Cette livraison ne merge pas la PR, ne déploie pas de fonction Edge et n'applique
aucune migration distante. Après merge, le déploiement backend habituel doit publier
le resolver compatible et le frontend avant d'activer la nouvelle identité DB.
Les simulations déterministes ne remplacent pas une campagne d'équilibrage humaine.
