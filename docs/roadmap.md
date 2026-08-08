# Roadmap et releases

## Jalons

### Jalon 1 — Fondations fiables

Schéma Supabase consolidé, Auth sans mailing, RLS durcie, sauvegarde atomique et
idempotente, mode invité et restauration de run. Ces capacités sont livrées et
reliées à leurs preuves dans `docs/feature-status.md`; leur exploitation distante
reste soumise aux migrations et smoke tests de chaque release.

### Jalon 2 — Boucle de jeu complète

Six biomes, combats, rencontres, inventaire, recrutement, runes, augments, XP,
maîtrise, améliorations et daily run. La boucle implémentée est couverte, mais le
contenu et l'équilibrage restent des travaux P3 : ce jalon ne promet pas que chaque
effet imaginé dans les catalogues futurs est disponible.

### Jalon 3 — Qualité de production

Architecture modulaire, CI, couverture, E2E, assets épinglés, découpage du bundle,
sécurité Vercel et documentation d'exploitation. Ce jalon reste **en cours** tant
que la checklist ci-dessous ne passe pas sur `main`. Au 8 août 2026, l'audit des
dépendances est bloquant et les runbooks de `P2-DOC-02` restent à écrire.

### Jalon 4 — Bêta

- tests E2E Auth/RLS sur l'environnement de préproduction ;
- observabilité respectueuse de la vie privée et politique publiée si activée ;
- campagne d'équilibrage à partir de runs réelles anonymisées ;
- accessibilité clavier/lecteur d'écran revue sur chaque rencontre ;
- budget de performance mobile respecté en CI ;
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
- [ ] `npm ci`, `npm run check`, `npm run test:e2e` et
      `npm run test:e2e:production` réussissent avec Node 26.
- [ ] Les changements de gameplay ont des tests déterministes.
- [ ] Les versions d'assets sont épinglées et leurs licences/sources respectées.
- [ ] `npm run audit:security` ne signale aucune vulnérabilité critique/haute non
      acceptée et aucune exception dépassée.

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
