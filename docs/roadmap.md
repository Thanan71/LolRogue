# Roadmap et releases

## Jalons

### Jalon 1 — Fondations fiables

Schéma Supabase consolidé, Auth sans mailing, RLS durcie, sauvegarde atomique et
idempotente, mode invité et restauration de run. Ce jalon est terminé.

### Jalon 2 — Boucle de jeu complète

Six biomes, combats, rencontres, inventaire, recrutement, runes, augments, XP,
maîtrise, améliorations et daily run. Ce jalon est terminé; les prochains travaux
portent sur l'équilibrage et l'enrichissement du contenu.

### Jalon 3 — Qualité de production

Architecture modulaire, CI, couverture, E2E, assets épinglés, découpage du bundle,
sécurité Vercel et documentation d'exploitation. Ce jalon est terminé lorsque la
checklist ci-dessous passe sur `main`.

### Jalon 4 — Bêta

- tests E2E Auth/RLS sur l'environnement de préproduction ;
- observabilité respectueuse de la vie privée et politique publiée si activée ;
- campagne d'équilibrage à partir de runs réelles anonymisées ;
- accessibilité clavier/lecteur d'écran revue sur chaque rencontre ;
- budget de performance mesuré sur mobile ;
- processus de support et restauration testé.

### Jalon 5 — Version publique

- contenu et équilibrage stabilisés ;
- compatibilité des navigateurs cibles validée ;
- sauvegarde/restauration Supabase répétée ;
- mentions légales, licence et politique de confidentialité finalisées ;
- version taguée et notes de release publiées.

## Checklist de release

### Code et données

- [ ] La branche de release est à jour et le diff ne contient aucun secret.
- [ ] `npm ci`, `npm run check` et `npm run test:e2e` réussissent avec Node 22.
- [ ] Les changements de gameplay ont des tests déterministes.
- [ ] Les versions d'assets sont épinglées et leurs licences/sources respectées.
- [ ] `npm audit --omit=dev` ne signale pas de vulnérabilité de production.

### Supabase

- [ ] Toute évolution SQL possède une nouvelle migration horodatée.
- [ ] `npm run db:validate` réussit sur une base locale jetable.
- [ ] Les types ont été régénérés avec `npm run db:types` si le schéma a changé.
- [ ] Les nouvelles tables et RPC ont des tests Auth/RLS positifs et négatifs.
- [ ] Une sauvegarde distante récente et une procédure de restauration existent.
- [ ] Les migrations ont été appliquées sur le bon projet avant le frontend.

### Déploiement

- [ ] Les variables `VITE_PUBLIC_SUPABASE_URL` et
      `VITE_PUBLIC_SUPABASE_ANON_KEY` ciblent le bon environnement.
- [ ] Aucune clé service-role n'est exposée dans Vercel côté client.
- [ ] Les URL Auth Supabase incluent le domaine de production.
- [ ] La CSP autorise uniquement les nouvelles origines nécessaires.
- [ ] Les routes profondes, assets et en-têtes de sécurité sont vérifiés.

### Smoke test

- [ ] Authentification et mode invité fonctionnent.
- [ ] Une run peut démarrer, changer de biome et reprendre après rechargement.
- [ ] Une victoire et une défaite sont enregistrées avec le bon résultat.
- [ ] Une reprise réseau n'enregistre pas deux fois la run ou les récompenses.
- [ ] Profil, maîtrise, améliorations et leaderboards affichent les bonnes données.
- [ ] Les accès admin sont acceptés/refusés selon le rôle.
- [ ] La console navigateur ne contient ni erreur inattendue ni ressource 404.

### Publication

- [ ] Le numéro de version et les notes de release sont prêts.
- [ ] Le commit déployé est tagué après validation du smoke test.
- [ ] Les changements visibles et migrations sont communiqués.
- [ ] Un responsable de surveillance et un plan de retour arrière sont désignés.
