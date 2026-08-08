# TODO NEXT — ordre de travail courant

Dernière mise à jour : **8 août 2026**

Ce document ne duplique plus les anciennes livraisons. `TODO.md` reste la source de
vérité détaillée, la [matrice](docs/feature-status.md) donne le statut des capacités
et l'[historique](docs/archive/delivery-history-2026-07-august.md) conserve les
claims clôturés.

## Dernière livraison — première passe P3-PROD-01

- [x] Modèle d'équilibrage v1 relié au gameplay et Daily v12.
- [x] Courbes difficulté/économie simulées de façon déterministe.
- [x] Rôles, forces, faiblesses et synergies des 10 champions contractualisés.
- [x] Identité, choix de carte et direction visuelle des six biomes définis à partir
  des mécaniques réellement générées.
- [x] Garde de contenu : roster, encounters et stacking incomplets font échouer les
  tests.

## Régressions de dépendances corrigées

- [x] React Router monté de 7.18.1 à 7.18.2.
- [x] `nanoid` transitif monté de 3.3.16 à 3.3.18 sans override.
- [x] Runtime, `.nvmrc` et CI alignés sur Node 24 compatible Vercel, sans rétrograder
  les paquets (`@types/node` reste en 26.2.0).
- [x] Exception temporaire supprimée : l'audit bloque désormais toute alerte haute
  ou critique.

Voir `docs/dependency-audit.md` pour le diagnostic et les versions vérifiées.

## Prochain chantier planifié

1. **P3-PROD-01 — calibration humaine restante** : réunir au moins 30 runs
   consenties par difficulté, playtester plusieurs compositions, puis versionner
   toute modification de prix/drop/augment dans un nouveau ruleset.
2. **Exécuter avant bêta l'exercice distant P2-DOC-02** sur un projet Supabase de
   restauration isolé et joindre la preuve privée à la fiche de release.
