# Vercel Speed Insights

LolRogue utilise `@vercel/speed-insights` pour mesurer les Web Vitals sur les déploiements Vercel.

## Intégration

- dépendance : `@vercel/speed-insights@2.0.0` ;
- composant React : `SpeedInsights` importé depuis `@vercel/speed-insights/react` ;
- montage : une seule fois au niveau racine dans `src/main.tsx` ;
- aucune variable d'environnement n'est requise pour l'intégration de base.

## Vérification après déploiement

1. Activer Speed Insights dans le dashboard Vercel du projet.
2. Déployer un commit contenant l'intégration.
3. Ouvrir le site sans bloqueur de contenu.
4. Vérifier que le script Speed Insights est chargé dans l'onglet Network.
5. Naviguer sur le site puis quitter/changer d'onglet afin de permettre l'envoi des métriques.
6. Vérifier ensuite les données dans le dashboard Speed Insights.

Le test `tests/speedInsightsIntegration.test.ts` empêche la suppression accidentelle de la dépendance ou du composant racine.

## Frontière avec le budget de laboratoire

La télémétrie Vercel est une mesure terrain distincte. Elle dépend de visiteurs réels,
du déploiement et de la revue confidentialité/consentement décrite dans
`docs/legal-and-privacy.md`. Elle n'est jamais lue par GitHub Actions et ne peut pas
faire réussir ou échouer une PR.

La gate de CI utilise uniquement `labMobileWebVitals` dans
`config/performance-budgets.json` : preview locale, profil mobile versionné, cinq
échantillons après warm-up et agrégat p75. La section `realUserTelemetry` formalise
que Speed Insights reste hors CI et soumis à la revue de confidentialité. Une valeur
terrain ne doit pas être comparée directement à une valeur de laboratoire sans
mentionner sa source.
