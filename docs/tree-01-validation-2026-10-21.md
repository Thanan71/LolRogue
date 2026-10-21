# Validation TREE-01 — 21 octobre 2026

Branche : `feat/tree-01-enhancement-graph-audit`, issue de `dev` au commit `c31b2d8b35a627aca20852386d3b6e48f65c4fff` (ADM-S7 fusionné). Version application `0.2.14`, publication bilingue 19. [Contrat et reproduction](enhancement-tree-audit.md).

## Diff et limites

Ajout d’une analyse pure, d’une matrice d’effets, d’une extraction du catalogue SQL, de rapports JSON/Markdown et d’un contrôle exact en CI. Six arbres, 72 nœuds, 57 atteignables côté client, 12 indisponibilités directes et trois descendants bloqués uniquement par leur parent. Aucun cycle, parent absent ou seuil de maîtrise impossible. Concordance des 72 attributs d’achat client/SQL ; éligibilité différente pour les 15 nœuds car la RPC ne filtre pas les effets indisponibles.

Aucune règle de jeu, dépendance de nœud, migration, permission, image ou archive d’authority modifiée. Les réparations restent attribuées à TREE-02..04. La version technique des runs reste `run-engine-0.2.5`, gameplay 24. Les tests d’observation des effets documentent les écarts existants.

## Preuves locales

- Graphe : 30 tests, dont catalogue complet et causes par ID, cycles, doublons, références manquantes, coûts, maîtrise et sélection du rôle.
- Effets : 11 tests, dont Phénix dans le vrai chemin de combat et Tir Déchirant dans le résolveur de dégâts et collision d’identité en combat miroir.
- Catalogue serveur : 9 tests d’extraction et de refus explicite d’une évolution non prise en charge.
- Rapport : 4 tests de couverture exhaustive, sélection des champions, déterminisme et six graphes.
- CLI : 14 tests de contrôle des entrées, génération déterministe, contrôle sans écriture et courses pendant lecture/publication.
- Gate base locale complet : **343 tests / 30 fichiers, zéro skip**, après réinitialisation et application des **73 migrations**. Inclut six nouveaux tests transactionnels d’audit. Lint SQL et comparaison exacte des types réussis, sans modification des types suivis. Durée des tests SQL : 64,87 s.
- TypeScript application, scripts et e2e : réussi.
- `check:static` complet : réussi, dont comparaison sans écriture des rapports, inventaire, artefacts, formatage, lint et 151 contrôles de contenu.
- Contrat CLI : 126 tests réussis, dont transmission de `--check` et plan public en lecture seule.
- Sécurité : aucune vulnérabilité haute ou critique détectée par le gate existant.

Les résultats complets du contrôle statique, des suites complémentaires, du clone vierge, de la CI et de la Preview sont joints à la PR pour le SHA final. Une CI verte ne vaut pas preuve de déploiement des migrations ou Edge Functions sur une base distante. Aucun déploiement manuel ni fusion n’est effectué dans ce lot.
