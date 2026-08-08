# Installation Vercel Speed Insights — 8 août 2026

Cette note consigne l'activation de `@vercel/speed-insights@2.0.0` dans LolRogue.

Le package est installé comme dépendance de production et le composant React `SpeedInsights` est monté au niveau racine de l'application. Le lockfile npm est synchronisé afin que `npm ci` reste reproductible.

La documentation légale/confidentialité a été ajustée pour ne plus affirmer qu'aucune télémétrie de performance n'est active. Speed Insights reste distinct d'une analytics comportementale ou publicitaire.
