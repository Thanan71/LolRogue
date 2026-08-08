# Légal et confidentialité

Version produit : 8 août 2026. Région préparée : France et Union européenne.
Ce document décrit le produit actuel ; il ne constitue pas un avis juridique.

## Statut de diffusion

LolRogue est un prototype de fans gratuit et non commercial. La monétisation est
interdite par le contrat produit. La bêta publique reste bloquée tant que les éléments
suivants ne sont pas obtenus : identité complète de l'éditeur, canal privé d'exercice
des droits, revue RGPD/ePrivacy par un professionnel et analyse écrite de la
compatibilité du jeu avec la politique Riot.

La politique officielle Riot « Legal Jibber Jabber », consultée le 8 août 2026,
demande un projet communautaire gratuit/non commercial et un avis visible indiquant
que Riot ne soutient ni ne sponsorise le projet. Elle précise également de ne pas
utiliser la propriété intellectuelle Riot dans un jeu ou une application. Le
disclaimer seul ne résout donc pas ce risque : une autorisation ou un avis juridique
est requis avant diffusion publique.

Sources à revalider avant chaque release :

- <https://www.riotgames.com/en/legal>
- <https://www.riotgames.com/en/terms-of-service-update-2024>

## Inventaire des données

| Périmètre | Données | Finalité | Visibilité | Durée |
| --- | --- | --- | --- | --- |
| Auth | e-mail, session, identifiant Auth | connexion et sécurité | utilisateur/opérateurs | vie du compte |
| Profil | nom de compte, affichage, avatar, préférences publiques | progression et profil | privé, sauf champs de classement décrits ci-dessous | vie du compte |
| Gameplay | runs, attempts, commandes, équipe, inventaire, métriques | reprise, vérification, progression | utilisateur/opérateurs | vie du compte |
| Daily public | alias/pseudonyme, rang, score, vagues, niveau, versions | classement comparable | public | 13 mois maximum |
| Global public | alias/pseudonyme, avatar facultatif, niveau, victoires et taux | classement global | public tant que non opt-out | vie du compte ou opt-out |
| Modération | score signalé, auteur, motif, décision | intégrité du classement | modérateurs | ouverts jusqu'à décision ; traités 24 mois |
| Diagnostic | opération, durée, erreur nettoyée | disponibilité et sécurité | utilisateur concerné/opérateurs | 14 jours maximum |
| Performance | Web Vitals et métadonnées techniques de navigation collectées par Vercel Speed Insights | mesurer et améliorer les performances | Vercel / exploitant | selon la configuration et les conditions Vercel en vigueur |
| Invité | réglages, tutoriels, progression et run locale | fonctionnement hors compte | appareil uniquement | jusqu'à effacement du navigateur |

La vue Daily applique directement la fenêtre de 13 mois. La maintenance appelle
mensuellement `SELECT public.purge_expired_social_data();` avec le rôle service ou un
administrateur afin de supprimer les signalements traités depuis plus de 24 mois.
Le purgeur de logs existant conserve au maximum 14 jours.

## Base juridique à faire valider

- Exécution du service demandé : Auth, sauvegarde, vérification et progression.
- Intérêt légitime à confirmer : sécurité, prévention de fraude, diagnostics et
  mesure de performance minimisée.
- Consentement préalable : toute future télémétrie comportementale ou non strictement
  nécessaire selon sa qualification juridique.
- Obligations légales : conservation exceptionnelle uniquement si documentée.

Aucune décision automatisée ne produit d'effet juridique. Une invalidation de score
est une mesure de jeu auditable et contestable auprès de l'exploitant.

## Stockage navigateur, cookies et télémétrie

Il n'existe actuellement aucun SDK publicitaire ni analytics comportementale de type
profilage marketing. Vercel Speed Insights est activé uniquement pour mesurer les
performances Web Vitals du site et transmettre les métriques techniques nécessaires
à cette mesure. Cette collecte doit rester minimisée et être réévaluée dans la revue
RGPD/ePrivacy avant une bêta publique.

Les données locales sont strictement fonctionnelles : session Supabase, réglages,
progression invitée, reprise de run et état des tutoriels. Aucun bandeau de
consentement ne doit prétendre qu'une télémétrie publicitaire ou marketing est active.

`VITE_ENABLE_DB_LOGGING` reste désactivé en production. Son activation exige une
finalité, une information visible, une revue de minimisation, une durée, un droit
d'opposition/consentement selon la qualification juridique et un test de suppression.

## Droits et suppression

Les procédures opérateur d'export et suppression sont dans
`docs/release-and-support.md`. La suppression retire d'abord les participations Daily
qui bloquent les cascades, puis l'utilisateur Supabase Auth ; elle vérifie ensuite
l'absence de profil, maîtrise, améliorations, runs et attempts. Les sessions sont
invalidées et l'utilisateur efface séparément les données locales de son navigateur.

Avant bêta, l'exploitant doit publier un canal privé permettant accès, rectification,
opposition, portabilité et suppression sans demander de secret dans une issue GitHub.

## Checklist avant diffusion ou monétisation

- [ ] Identité/adresse de l'éditeur et directeur de publication complétées.
- [ ] Canal privé d'exercice des droits et délai de réponse testés.
- [ ] Région Supabase, sous-traitants, transferts et DPA vérifiés.
- [ ] Revue RGPD/ePrivacy obtenue et datée.
- [ ] Compatibilité Riot confirmée par un conseil et, si nécessaire, Riot.
- [ ] Aucun paiement, publicité, sponsoring ou vente activé avant ces validations.
