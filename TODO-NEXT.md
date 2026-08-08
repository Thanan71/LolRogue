# TODO NEXT — ordre de travail courant

Dernière mise à jour : **8 août 2026**

Ce document ne duplique plus les anciennes livraisons. `TODO.md` reste la source de
vérité détaillée, la [matrice](docs/feature-status.md) donne le statut des capacités
et l'[historique](docs/archive/delivery-history-2026-07-august.md) conserve les
claims clôturés.

## Dernière livraison — décisions produit transverses v1

- [x] Langue, identité invitée, Daily, autoplay et branches explicitement figés.
- [x] Récompenses de fin, XP des KO et inventaire plein alignés avec le moteur.
- [x] Contrat online/offline et télémétrie rendu explicite.
- [x] Récompense de combat bloquée par la capacité désormais annoncée au joueur.

Voir `docs/product-decisions.md` pour le contrat complet.

## Gate de sortie bêta — 10/10 critères techniques démontrés

- [x] Trois exécutions CI complètes consécutives réussies.
- [x] Parcours E2E victoire, défaite et Daily connecté sans accès direct aux stores.
- [x] Gate axe WCAG A/AA, clavier, focus, reflow et matrice responsive.
- [x] Les 187 assets du manifeste vérifiés sur le déploiement Vercel.

La revue humaine NVDA/VoiceOver et les gates juridiques externes de
`docs/legal-and-privacy.md` restent obligatoires avant une bêta publique. Voir
`docs/beta-readiness.md` pour distinguer preuve technique et validation externe.

## Livraison précédente — P3-PROD-04 (implémentation produit)

- [x] Page légale publique reliée depuis Auth et Menu.
- [x] Inventaire France/UE des données, finalités, stockage local et droits documenté.
- [x] Daily public limité à 13 mois et purge des signalements traités à 24 mois.
- [x] Exigences Riot officielles vérifiées et disclaimer visible.
- [ ] Audit juridique externe et analyse d'autorisation Riot obtenus.

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
2. **Lever les gates externes P3-PROD-04** avant bêta publique ou monétisation.
