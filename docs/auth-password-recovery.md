# Récupération du mot de passe

Le formulaire de connexion propose « Mot de passe oublié ? ». La demande envoie un lien via le dépôt d’authentification et affiche la même confirmation, qu’un compte existe ou non. Le lien revient sur `/auth?mode=recovery`. Une session Supabase valide ouvre le choix du nouveau mot de passe; un lien expiré ou invalide permet de demander un autre lien.

L’événement `PASSWORD_RECOVERY` conserve la session de récupération sans charger le profil ni ouvrir le menu avant la modification du mot de passe. Après l’enregistrement, le profil et la progression sont chargés avec le parcours d’authentification habituel. Les callbacks OAuth, magic link et le renouvellement de session gardent leur comportement.

Une partie invitée active doit être terminée ou abandonnée explicitement avant une connexion. Le bouton du profil utilise la même confirmation d’abandon que celui du menu; annuler préserve la partie. Le store refuse aussi une connexion directe avant de contacter le fournisseur.

## Configuration à vérifier au déploiement

- Dans Supabase **Authentication → URL Configuration → Redirect URLs**, autoriser l’URL exacte `<origine-production>/auth?mode=recovery`, et les origines de développement/preview utilisées. Le code construit l’URL à partir de l’origine de la page.
- Garder le lien de confirmation Supabase (`{{ .ConfirmationURL }}`) dans le modèle de récupération. Un modèle qui construit sa propre URL doit préserver la destination de redirection, au lieu de forcer `SiteURL`.
- Vérifier l’envoi SMTP et les limites d’envoi du projet. L’envoi et la réception d’un vrai e-mail n’ont pas été testés durant ces corrections locales.
- Tester avec un compte de validation : demande → réception → lien → nouveau mot de passe → accès au menu → connexion avec le nouveau mot de passe. Vérifier aussi un lien expiré et des mots de passe différents.

Les tests locaux simulent le fournisseur et vérifient le dépôt, les états du store et le formulaire. Ils ne modifient aucun compte ni réglage distant.

Références officielles consultées : [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser), [password-based Auth](https://supabase.com/docs/guides/auth/passwords), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [changelog](https://supabase.com/changelog).
