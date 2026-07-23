# Déploiement et exploitation

## Environnements

Chaque environnement Vercel pointe vers un projet Supabase correspondant. Les
variables navigateur obligatoires sont :

```env
VITE_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=...
```

La clé service-role n'est pas nécessaire au runtime Vercel. Après une modification
de variable `VITE_*`, redéployer : Vite injecte ces valeurs pendant le build.

Dans Supabase Auth, déclarer l'URL publique du site et les URL de redirection de
preview explicitement. La confirmation email reste désactivée puisque le produit
n'envoie pas de mails.

## Déployer

1. Appliquer et valider les migrations sur une base locale.
2. Sauvegarder la base distante avant une migration de production.
3. Lier la CLI au bon projet et exécuter `npm run migrate`.
4. Lancer `npm ci` puis `npm run check` et `npm run test:e2e`.
5. Pousser le commit validé sur `main`.
6. Laisser Vercel construire `dist`, puis contrôler le déploiement.

`vercel.json` réécrit toutes les routes vers `index.html`, ce qui permet d'ouvrir
directement `/auth`, `/run` ou `/admin`. Il définit également CSP, protection
anti-frame, politique de permissions, referrer policy et `nosniff`. Toute nouvelle
API, police ou origine d'image doit être ajoutée explicitement à la CSP.

## Vérifications après déploiement

- ouvrir directement `/auth` et vérifier l'absence de 404 ;
- créer une session ou entrer en invité ;
- démarrer une run, changer de biome et recharger la page ;
- terminer une run connectée et vérifier une seule ligne `runs` ;
- contrôler le profil, la maîtrise et les classements ;
- vérifier qu'un non-admin reçoit un refus sur les lectures admin ;
- examiner la console et l'onglet réseau : aucun asset 404, aucune erreur CSP et
  aucune clé privée ;
- vérifier les en-têtes de réponse de la page.

## Migrations et retour arrière

Les migrations sont progressives et ne doivent pas modifier rétroactivement un
fichier déjà appliqué sur une base partagée. Ajouter une nouvelle migration
horodatée et la tester avec `npm run db:validate`.

Une migration destructive doit inclure une sauvegarde, une estimation d'impact et
une procédure de restauration. Le retour arrière applicatif se fait en redéployant
un commit précédent compatible avec le schéma courant. Ne pas réinitialiser la
base de production pour revenir en arrière.

## Observabilité et confidentialité

Analytics et Speed Insights sont désactivés tant qu'une politique de confidentialité
et une base légale ne sont pas définies. Les logs applicatifs Supabase peuvent
contenir des identifiants techniques et des erreurs : limiter leur accès, leur
durée de conservation et ne jamais y envoyer de secret, mot de passe ou token.

Pour un incident :

1. noter l'heure, l'environnement, la route et le `runId` ;
2. reproduire sans données personnelles si possible ;
3. consulter les logs Vercel/Supabase et les erreurs du navigateur ;
4. vérifier l'état des migrations et les variables publiques ;
5. corriger par migration ou commit testé, jamais directement dans le bundle
   produit ;
6. documenter la cause, l'impact et la prévention.
