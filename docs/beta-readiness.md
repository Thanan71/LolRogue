# Gate de sortie bêta

<!-- release-readiness:status=blocked -->

**Statut objectif : BLOQUÉ.** La source de vérité est
`config/beta-release.json`, évaluée par `npm run release:preflight`. Une case
cochée dans `TODO.md`, un audit antérieur ou une CI historique ne constituent
jamais une preuve de release.

## État du candidat

| Gate objective | État actuel | Preuve exigée par le preflight |
| --- | --- | --- |
| P0 formalisés | Vérifié dans le dépôt | Chaque P0 possède le statut `verified` et au moins une commande de contrôle dans la fiche de release. |
| Identité du candidat | **Bloqué** | SHA Git complet de 40 caractères, identique à `HEAD`. |
| Trois CI complètes post-P0 | **Bloqué** | Trois runs du SHA candidat, créés après le merge du dernier P0, avec `validate`, `e2e`, `database` et `clean-room` réussis. |
| Preview exacte | **Bloqué** | URL HTTPS du candidat et validation de tous les assets par `test:deployed-assets`. |
| Migrations live | **Bloqué** | Version live égale à la dernière migration du dépôt et absence de drift via `db:migrations:check:linked`. |
| Tests DB et sécurité views/grants | **Bloqué** | Job `database` réussi sur chacune des trois CI ; il exécute `db:validate` et `db:security`. |
| E2E | **Bloqué** | Job `e2e` réussi sur chacune des trois CI du candidat. |
| Advisors Supabase | **Bloqué** | Résultat `passed`, URL de preuve et date postérieure au dernier correctif P0. |
| Validations externes | **Bloqué** | Preuves datées pour accessibilité humaine, droit/RGPD, canal de support et autorisation Riot. |

Ce tableau décrit la fiche versionnée actuelle ; il n'est pas une validation
manuelle. `npm run release:readiness:check` échoue si le statut déclaré ou cette
page contredit les preuves enregistrées. `npm run release:preflight` reste
volontairement en échec tant qu'une gate manque et revérifie GitHub, la base liée
et la preview dès que la fiche est complète.

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

Le job `database` couvre la base réellement migrée, les tests de repositories,
les politiques RLS et la sécurité des vues et grants. Le job `e2e` couvre les
parcours victoire, défaite et Daily autoritaire sans mutation directe du store.
Le job `clean-room` reconstruit le dépôt sans artefact local. Le preflight ajoute
la comparaison des migrations liées et le contrôle des assets servis par l'URL
preview exacte.

## Validations humaines et externes

La revue lecteur d'écran doit consigner appareil, OS, navigateur, technologie
d'assistance, SHA, parcours et résultat pour NVDA + Firefox et VoiceOver +
Safari/iOS. Les validations juridiques France/UE, le canal de support public et
la clarification écrite de l'usage de la propriété intellectuelle Riot restent
décrits dans `legal-and-privacy.md`. Aucun test local ne peut les remplacer.
