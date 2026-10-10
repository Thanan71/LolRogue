# Bêta sans abonnement — arbitrage des gates (10 octobre 2026)

> **Budget supplémentaire ciblé : 0 € / mois.** Ce document propose des choix de coût ; il **n'atteste aucune validation en production**. Source de vérité de la sortie bêta publique : `config/beta-release.json` et `npm run release:preflight`, actuellement BLOQUÉS. Ne jamais déclarer `passed` sans preuve réelle.

## Deux niveaux de test à ne pas confondre

- **Vérification interne / alpha restreinte** : partie technique sur l'environnement de développement, données et comptes dédiés, sauvegardes chiffrées et droits minimisés. L'exercice local de restauration peut suffire à établir la capacité de reconstruction **locale**. Ne garantit ni la disponibilité d'une production, ni la légalité d'une diffusion de contenus Riot à des tiers.
- **Bêta publique** : toutes les gates objectives de `config/beta-release.json` restent applicables : P0 résolus, trois CI du même SHA, preview exacte, migration liée, DB/E2E, advisors, accessibilité humaine, conformité des données et solution licite pour les éléments Riot. Les services payants et audits professionnels ne sont **pas des prérequis automatiques**, mais aucune économie ne justifie de contourner une obligation réelle.

## Revue des gates et stratégie à 0 €

| Gate / chantier | Coût potentiellement imposé par l'ancien libellé | Voie sans abonnement | Décision et preuve nécessaire |
| --- | --- | --- | --- |
| `P0-I18N-01` et audit humain FR/EN | Aucun abonnement | Tests manuels avec navigateur, clavier, NVDA (gratuit sous Windows), VoiceOver intégré aux appareils Apple disponibles ou prêtés | **Garder bloquant** jusqu'à rapport humain daté sur SHA/preview |
| CI `static`, `unit`, `security`, `build/assets`, `DB`, `browser`, `clean-room` | Dépassement éventuel de quotas GitHub Actions | Actions/runner disponibles avec quota gratuit ; réduire les runs inutiles, conserver **trois réussites complètes** post-P0 sur le même SHA | **Garder bloquant** ; lien des trois runs |
| Preview exacte Vercel | Offre Pro non nécessaire à une preview de petit projet personnel non commercial | Déploiement Preview Vercel Hobby et vérification de l'URL/du SHA/assets exacts | **Garder bloquant** |
| Migration DB liée, RLS, authority, E2E, rejet des runs illégitimes, Daily | Aucun achat de fonctionnalité identifié | Supabase actuel, CLI, tests et vérification de version | **Garder bloquant** ; aucune validation par simple case TODO |
| Advisors Supabase sécurité/performance | Pas d'upgrade requis pour les contrôles DB de base | `node scripts/check-supabase-advisors.mjs --linked`, allowlist exacte avec expiration | **Garder bloquant**, notamment toutes les ERROR de sécurité |
| `P1-SEC-01` — Leaked Password Protection | **Supabase Pro** requis pour le rejet natif de mots de passe divulgués | Sur Free, configurer la longueur minimale de mot de passe **>= 12**, vérifier les messages Auth, changements/récupération et mesures anti-abus ; sensibiliser à la non-réutilisation | **Exclure l'activation Pro de la gate**, conserver le ticket P1 ouvert et explicitement optionnel. La longueur n'est **pas** un substitut équivalent à une détection de fuite |
| Backups quotidiens fournis par Supabase | Sauvegardes automatiques hébergées réservées aux offres payantes | `npm run backup:database` / Supabase CLI `db dump`, archive chiffrée **hors plateforme**, empreintes SHA-256, rétention et contrôle effectif quotidien | **Garder l'obligation de backup utilisable** ; ne pas prétendre avoir un backup fournisseur ou PITR |
| `P2-OPS-01` — exercice de restauration dans **un troisième projet Supabase** | Deux projets Free actifs déjà occupés (`LolRogue` et `LolRogueDev`) ; troisième simultané non disponible en Free | `npm run ops:restore-drill -- --evidence=...` sur une deuxième stack **locale jetable**, en utilisant une sauvegarde vérifiée ; documenter RPO/RTO mesurés et les limites de ce test | **Exclure le troisième projet hébergé de la gate technique à zéro budget**. Conserver `P2-OPS-01` ouvert comme amélioration ; ne pas promettre de RTO hébergé |
| Accessibilité clavier/zoom/lecteur d'écran | Audit externe éventuellement facturé | Tests humains bénévoles avec NVDA/VoiceOver, checklist et rapport daté par appareil/OS/navigateur | **Garder bloquant** pour la bêta publique |
| `P3-LEGAL-01` — RGPD/ePrivacy | Consultation professionnelle éventuellement payante | Autoaudit documenté à partir des ressources gratuites de la CNIL ; registre, base légale, minimisation, durée, droits, télémétrie, fournisseurs et DPA, corrections mesurées | **Exclure l'obligation systématique de payer un cabinet**, pas l'obligation de conformité. Demander une expertise si risque non résolu |
| Canal support et demandes d'exercice des droits | Helpdesk SaaS payant non nécessaire | Adresse e-mail dédiée gratuite et privée, procédure d'identification, suivi à accès restreint, accusé de réception et tests des demandes | **Garder bloquant** : prouver que le canal fonctionne, sans exposer de données en issue publique |
| Autorisation Riot et éléments protégés | Licence éventuelle non acquise (pas simplement un abonnement) | **Demander une autorisation adaptée à Riot, sans présumer d'un accord** ; sinon créer personnages, noms, illustrations, compétences et éléments de contenu originaux ou correctement licenciés | **Garder bloquant pour la diffusion publique**. Un disclaimer ni une autoanalyse ne donnent droit d'intégrer l'IP Riot dans un jeu |
| Analytics, APM, Speed Insights | Quotas ou fonctionnalités payantes | Quotas Vercel Hobby gratuits, métriques déjà collectées, tests ponctuels locaux ; ne pas acheter d'extension | **Exclure l'offre Pro**, mais conserver l'observabilité minimale et les obligations relatives aux données |

## Actions à mener avant une alpha restreinte sans abonnement

1. **Auth Free** — relever la configuration réelle (longueur minimale >= 12, parcours inscription, changement/réinitialisation et quotas), tester trois cas valides/invalides sur `LolRogueDev` ; ne pas désactiver des contrôles serveur pour éviter une option payante.
2. **Backups Free** — confirmer que le workflow quotidien produit une sauvegarde chiffrée et **récupérable** hors fournisseur, empreintes vérifiées, destination et retention réelles. Ne jamais inclure dumps de joueurs, mots de passe ou secrets dans une PR ou dans un artefact public.
3. **Restauration Free** — rejouer `ops:restore-drill` sur un candidat récent et une cible **strictement locale** distincte ; dater la preuve ; ne jamais restaurer sur `LolRogue` ou `LolRogueDev`.
4. **Comptes de test / confidentialité** — minimiser les données, tester l'export/suppression et l'isolement RLS, publier un canal privé ; éviter d'inviter des utilisateurs réels sans capacité d'assistance et d'effacement vérifiée.
5. **Libération du candidat** — vérifier P0 i18n, CI, E2E, preview et migrations du SHA retenu. `beta-release.json` doit rester `blocked` tant que ses preuves ne sont pas collectées.
6. **Propriété intellectuelle** — avant toute mise à disposition à des tiers, arbitrer Riot ; ne pas confondre nombre limité d'invitations et droit d'utilisation.

## Limites et décisions à ne pas masquer

- **Ce qui est exclu de la gate pour raison de coût** : Supabase Pro Leaked Password Protection, troisième projet hébergé dédié à la restauration, monitoring commercial, revue professionnelle RGPD systématique.
- **Exception advisors précise** : `config/supabase-advisors.json` autorise seulement `security/auth_leaked_password_protection` de niveau `WARN`, jusqu'au **31 janvier 2027**. Toute `ERROR`, alerte inconnue, changement de niveau ou expiration doit bloquer le contrôle. Cette exception est testée et doit être reconsidérée à échéance.
- **Ce qui n'est jamais exclu** : tests de sécurité DB/RLS, reprise des données à partir d'une sauvegarde réellement utilisable, preuves exactes de release, respect du RGPD, solution licite pour l'IP, canaux privés d'exercice des droits.
- **Ce qui demeure ouvert** : `P1-SEC-01` (protection native payante facultative), `P2-OPS-01` (preuve de restauration hébergée additionnelle), et toutes les gates dont les preuves sont encore absentes.
- **Limite de disponibilité** : le Free peut mettre des projets en pause pour inactivité ; les quotas Vercel Hobby/Supabase Free peuvent interrompre le service. Aucun SLA ni RTO de 4 h ne doit être présenté comme garanti avant validation réaliste.
- **SMTP Auth** : l'envoi d'e-mails Supabase intégré au plan gratuit peut être réservé aux destinataires autorisés et fortement limité. Préparer une solution SMTP compatible et vérifier son quota avant un recrutement de testeurs externes ; un mot de passe robuste n'élimine pas le besoin de confirmer les comptes et de gérer les demandes de récupération.

## Références officielles

- Supabase : [Tarifs](https://supabase.com/pricing), [sécurité des mots de passe](https://supabase.com/docs/guides/auth/password-security), [sauvegardes](https://supabase.com/docs/guides/platform/backups), [projets gratuits](https://supabase.com/docs/guides/platform/billing-on-supabase), [SMTP Auth](https://supabase.com/docs/guides/auth/auth-smtp).
- Vercel : [Hobby](https://vercel.com/docs/plans/hobby).
- Accessibilité : [NVDA gratuit](https://www.nvaccess.org/download/).
- CNIL : [Ressources RGPD pour petites structures](https://www.cnil.fr/fr/les-autres-ressources-utiles-pour-les-tpe-et-pme).
- Riot : [Legal Jibber Jabber](https://www.riotgames.com/en/legal) et [Developer API Policy](https://developer.riotgames.com/docs/lol).
