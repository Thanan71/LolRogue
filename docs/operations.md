# Déploiement et exploitation

## Environnements

Chaque environnement Vercel pointe vers un projet Supabase correspondant. Les
variables navigateur obligatoires sont :

```env
VITE_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=...
```

La clé service-role n'est pas nécessaire au runtime Vercel et ne doit jamais y
être exposée. Supabase l'injecte dans le runtime de l'Edge Function `verify-run`.
Après une modification de variable `VITE_*`, redéployer : Vite injecte ces valeurs
pendant le build.

Dans Supabase Auth, déclarer l'URL publique du site et les URL de redirection de
preview explicitement. La confirmation email reste désactivée puisque le produit
n'envoie pas de mails.

## Déployer

1. Appliquer et valider les migrations sur une base locale.
2. Lancer `npm ci`, `npm run edge:bundle`, `npm run check`,
   `npm run test:db` et `npm run test:e2e`.
3. Sauvegarder la base distante et prévoir une courte fenêtre de déploiement :
   la migration révoque immédiatement l'ancien chemin `client_reported` et fait
   expirer les attempts ouverts antérieurs à la quarantaine des améliorations.
4. Lier la CLI au bon projet et déployer d'abord la fonction encore dormante avec
   `npm run edge:deploy`.
5. Exécuter `npm run migrate`, puis déployer immédiatement le client compatible.
6. Contrôler le déploiement et fermer la fenêtre seulement après le test d'une run
   connectée complète.

Cet ordre rend le vérificateur disponible avant la révocation de l'ancien RPC. Ne
pas déployer le nouveau client avant la migration : il ne trouverait pas les RPC
d'attempt. Ne pas laisser durablement l'ancien client après la migration : ses
sauvegardes connectées seront volontairement refusées.

`vercel.json` réécrit toutes les routes vers `index.html`, ce qui permet d'ouvrir
directement `/auth`, `/run` ou `/admin`. Il définit également CSP, protection
anti-frame, politique de permissions, referrer policy et `nosniff`. Toute nouvelle
API, police ou origine d'image doit être ajoutée explicitement à la CSP.

## Vérifications après déploiement

- ouvrir directement `/auth` et vérifier l'absence de 404 ;
- créer une session ou entrer en invité ;
- démarrer une run connectée et vérifier la présence d'un `run_attempt` possédé par
  l'utilisateur, avec seed et versions définies par le serveur ;
- changer de biome, recharger la page et reprendre le même attempt/journal ;
- terminer une run connectée et vérifier un statut `verified`, une seule ligne
  `runs` avec `progression_source = 'verified'`, puis rejouer la requête de
  vérification pour confirmer l'absence de doublon ;
- soumettre une trace impossible sur un compte de test et confirmer le statut
  `rejected` sans candies, maîtrise ni compteur supplémentaire ;
- contrôler le profil, la maîtrise et les classements ;
- vérifier qu'un non-admin reçoit un refus sur les lectures admin ;
- examiner la console et l'onglet réseau : aucun asset 404, aucune erreur CSP et
  aucune clé privée ;
- vérifier les en-têtes de réponse de la page.

## Migrations et retour arrière

Les migrations sont progressives et ne doivent pas modifier rétroactivement un
fichier déjà appliqué sur une base partagée. Ajouter une nouvelle migration
horodatée et la tester avec `npm run db:validate`.

Le couple `engine_version`/`content_hash` d'un `gameplay_ruleset` est immuable dès
qu'un attempt l'utilise. `npm run edge:bundle` recalcule le hash du bundle
normalisé et échoue si le moteur, le bundle et le ruleset divergent. Pour changer
les règles ou le contenu autoritaire, ajouter une nouvelle version de ruleset, son
catalogue et la migration correspondante, conserver l'ancien vérificateur dans le
registre pendant au moins la durée maximale d'un attempt, puis seulement activer
la nouvelle version.

Une migration destructive doit inclure une sauvegarde, une estimation d'impact et
une procédure de restauration. Le retour arrière applicatif se fait en redéployant
un commit précédent compatible avec le schéma courant. Une fois l'ancien RPC
révoqué, ne pas le réactiver pour revenir en arrière : mettre temporairement les
nouveaux départs en maintenance et conserver les attempts/journaux pour reprise.
Ne pas réinitialiser la base de production pour revenir en arrière.

## Observabilité et confidentialité

Analytics et Speed Insights sont désactivés tant qu'une politique de confidentialité
et une base légale ne sont pas définies. Les logs applicatifs Supabase peuvent
contenir des identifiants techniques et des erreurs : limiter leur accès, leur
durée de conservation et ne jamais y envoyer de secret, mot de passe ou token.

Pour un incident :

1. noter l'heure, l'environnement, la route, le `runId` et l'`attemptId` ;
2. reproduire sans données personnelles si possible ;
3. consulter les logs Vercel/Supabase et les erreurs du navigateur ;
4. vérifier l'état des migrations et les variables publiques ;
5. corriger par migration ou commit testé, jamais directement dans le bundle
   produit ;
6. documenter la cause, l'impact et la prévention.
