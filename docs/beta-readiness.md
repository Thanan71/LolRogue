# Gate de sortie bêta

<!-- release-readiness:status=blocked -->

**Statut objectif : BLOQUÉ.** La source de vérité est
`config/beta-release.json`, évaluée par `npm run release:preflight`. Une case
cochée dans `TODO.md`, un audit antérieur ou une CI historique ne constituent
jamais une preuve de release.

## État du candidat

| Gate objective | État actuel | Preuve exigée par le preflight |
| --- | --- | --- |
| P0 formalisés | **Bloqué : P0-I18N-01 ouvert** | Tous les P0 du backlog doivent figurer dans la fiche, sans doublon, avec statut `verified` et commandes de contrôle. La revue humaine FR/EN et sa preview restent à prouver. |
| Identité du candidat | **Bloqué** | SHA Git complet de 40 caractères, identique à `HEAD`. |
| Trois CI complètes post-P0 | **Bloqué** | Trois runs du SHA candidat, créés après le merge du dernier P0, avec `static`, `unit`, `security`, `build/assets`, `DB`, `browser` et `clean-room` réussis. |
| Preview exacte | **Bloqué** | URL HTTPS du candidat et validation de tous les assets par `test:deployed-assets`. |
| Migrations live | **Bloqué** | Version live égale à la dernière migration du dépôt et absence de drift via `db:migrations:check:linked`. |
| Tests DB et sécurité views/grants | **Bloqué** | Job `DB` réussi sur chacune des trois CI ; il exécute `db:validate` et `db:security`. |
| E2E | **Bloqué** | Job `browser` réussi sur chacune des trois CI du candidat. |
| Advisors Supabase | **Bloqué** | Politique liée sécurité + performance conforme, résultat `passed`, URL de preuve et date postérieure au dernier correctif P0. |
| Validations externes | **Bloqué** | Preuves datées pour accessibilité humaine, droit/RGPD, canal de support et autorisation Riot. |

Ce tableau décrit la fiche versionnée actuelle ; il n'est pas une validation
manuelle. `npm run release:readiness:check` échoue si le statut déclaré ou cette
page contredit les preuves enregistrées. `npm run release:preflight` reste
volontairement en échec tant qu'une gate manque et revérifie GitHub, la base liée
et la preview dès que la fiche est complète.

Réconciliation du 4 octobre 2026 : les onze P0 actuels sont recensés, y compris
les cinq P0 d'équilibrage et le P0 i18n auparavant absents de la fiche. Le statut
`verified` d'un invariant de code n'atteste ni du déploiement ni d'un test récent
sur le candidat. Depuis le nettoyage du 7 octobre, les titres de `TODO.md`
conservent le P0 i18n ouvert et un inventaire compact des dix invariants P0
livrés ; les travaux et critères détaillés sont dans le
[snapshot intégral du backlog](archive/todo-snapshot-2026-10-07.md).
L'inventaire lit seulement ces identifiants ; il ne transforme jamais des cases
cochées ou un archivage en preuves de release.

Les gates locales servent à préparer les tâches des sprints. Les protections
GitHub de `main` et `dev` exigent les checks distants ; les compléments de
`P2-CI-01` concernent la preuve d'annulation/neutralisation et les runs concurrents.
Les trois CI candidates, la preview exacte et les preuves live restent ici
**bloquantes** pour la bêta.

## Fiche de release obligatoire

Avant toute décision de bêta, renseigner dans `config/beta-release.json` :

- le SHA complet du dernier correctif P0 et sa date de merge ;
- le SHA exact du candidat testé, sans alias de branche ;
- l'URL de preview construite depuis ce SHA ;
- la version exacte de la dernière migration observée sur la base live ;
- les identifiants et URL des trois runs GitHub Actions du candidat ;
- les URL et dates des résultats advisors et des validations externes.

Les trois runs ne comptent que s'ils sont tous postérieurs au dernier correctif
P0 et testent le même SHA candidat. Une annulation, un job manquant, un rerun
partiel, un nouveau correctif P0 ou une reconstruction de la preview remet la
gate à **bloqué**.

## Portée des contrôles

Le job `DB` couvre la base réellement migrée, les tests de repositories,
les politiques RLS et la sécurité des vues et grants. Le job `browser` couvre les
parcours victoire, défaite et Daily autoritaire sans mutation directe du store.
Le job `clean-room` reconstruit le dépôt sans artefact local. Le preflight ajoute
la comparaison des migrations liées, l'exécution de la politique versionnée des
advisors sécurité + performance et le contrôle des assets servis par l'URL preview
exacte.

## Validations humaines et externes

La revue lecteur d'écran doit consigner appareil, OS, navigateur, technologie
d'assistance, SHA, parcours et résultat pour NVDA + Firefox et VoiceOver +
Safari/iOS. Les validations juridiques France/UE, le canal de support public et
la clarification écrite de l'usage de la propriété intellectuelle Riot restent
décrits dans `legal-and-privacy.md`. Aucun test local ne peut les remplacer.
