# Archive — livraisons de stabilisation juillet–août 2026

Cette synthèse remplace les longues listes de claims autrefois copiées dans
`TODO-NEXT.md`. Les détails exacts restent disponibles dans l'historique Git, les
migrations append-only et les tests associés.

## Sécurité et authority

- Progression connectée déplacée vers les attempts serveur, journaux scellés,
  replay Edge et transaction `complete_run_verification`.
- Leaderboard Daily calculé côté serveur, données publiques réduites et logs
  authentifiés/sanitisés.
- Moteurs versionnés jusqu'à `run-engine-v12`, avec conservation des contrats
  historiques nécessaires aux attempts déjà ouverts.

## Run et gameplay

- Victoire, défaite et abandon finalisés durablement avec retry et snapshot.
- Carte à frontière unique, encounters et récompenses idempotents.
- Combat manuel par défaut, autoplay activable par le joueur et traces compatibles
  avec le replay autoritaire.
- Runes, augments, objets, maîtrise et améliorations raccordés aux règles communes ;
  stats canoniques en v12.

## Données, UI et qualité

- Stores versionnés, payloads invalides mis en quarantaine et reprise de combat
  déterministe.
- Shell responsive, i18n, feedback, clavier, focus, lisibilité et mouvement réduit.
- Tests de comportement, couverture par domaine, clean-room, assets Riot vérifiés,
  budgets de performance et matrice de navigateurs de production.

## Incidents et correctifs ponctuels archivés

- démarrage avec deux champions et trois runes ;
- autoplay forcé puis suffixe automatique après résultat terminal ;
- versions/bundles authority trop volumineux ou absents ;
- CORS et transaction de progression après vérification ;
- conservation du champion sélectionné après achat d'amélioration.

Cette archive n'est pas un statut courant. Consulter `docs/feature-status.md`,
`TODO.md` et la CI de la révision visée.
