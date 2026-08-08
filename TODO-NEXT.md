# TODO NEXT — ordre de travail courant

Dernière mise à jour : **8 août 2026**

Ce document ne duplique plus les anciennes livraisons. `TODO.md` reste la source de
vérité détaillée, la [matrice](docs/feature-status.md) donne le statut des capacités
et l'[historique](docs/archive/delivery-history-2026-07-august.md) conserve les
claims clôturés.

## Dernière livraison — P3-PROD-03

- [x] Alias public facultatif, pseudonyme anonyme et opt-out depuis les réglages.
- [x] Rangs isolés par date/rulesets et rattachés à une saison serveur.
- [x] Filtres de versions ajoutés au classement Daily.
- [x] Signalement privé et invalidation administrateur auditable.
- [x] Partage, amis et spectateur explicitement différés au modèle de confidentialité.

## Régressions de dépendances corrigées

- [x] React Router monté de 7.18.1 à 7.18.2.
- [x] `nanoid` transitif monté de 3.3.16 à 3.3.18 sans override.
- [x] Runtime, `.nvmrc` et CI alignés sur Node 24 compatible Vercel, sans rétrograder
  les paquets (`@types/node` reste en 26.2.0).
- [x] Exception temporaire supprimée : l'audit bloque désormais toute alerte haute
  ou critique.

Voir `docs/dependency-audit.md` pour le diagnostic et les versions vérifiées.

## Prochain chantier planifié

1. **Exécuter avant bêta l'exercice distant P2-DOC-02** sur un projet Supabase de
   restauration isolé et joindre la preuve privée à la fiche de release.
2. **P3-PROD-04 — Légal et confidentialité.**
