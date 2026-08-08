# TODO NEXT — ordre de travail courant

Dernière mise à jour : **8 août 2026**

Ce document ne duplique plus les anciennes livraisons. `TODO.md` reste la source de
vérité détaillée, la [matrice](docs/feature-status.md) donne le statut des capacités
et l'[historique](docs/archive/delivery-history-2026-07-august.md) conserve les
claims clôturés.

## Dernière livraison — P2-DOC-01

- [x] README, roadmap, gameplay, persistance, tests et audit des dépendances sont
  alignés sur le code et le lockfile du 8 août 2026.
- [x] Les anciens constats du 23 juillet sont archivés au lieu d'être présentés
  comme l'état courant.
- [x] Le score Daily documente la journée UTC, la formule SQL et
  `score_version = 12`.
- [x] `docs/feature-status.md` relie chaque capacité à son implémentation, ses tests
  et son statut.
- [x] Les limites des effets, du mode invité et de la frontière RPC sont explicites.

## Blocage immédiat découvert

- [ ] Refermer `P0-SEC-03` : `npm run audit:security` échoue sur
  `nanoid@3.3.16` et React Router 7.18.1.
- [ ] Réaligner `@types/node` 26 sur le runtime Node 22 et revalider la montée
  TypeScript 7/outillage.

Voir `docs/dependency-audit.md` pour le diagnostic reproductible. Tant que ces deux
cases restent ouvertes, ne pas qualifier `main` de prêt pour une release.

## Prochain chantier planifié

1. **P2-DOC-02 — Préparer l'exploitation** : runbooks migration/rollback/incidents,
   sauvegarde et restauration, séparation des environnements, checklist de release
   et support utilisateur.
2. **P3 — Produit et enrichissement** seulement après clôture des blocages de
   sécurité et d'exploitation.
