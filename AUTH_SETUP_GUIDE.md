# Guide de Configuration du Système d'Authentification

## 🎯 Vue d'ensemble

Le système d'authentification est maintenant entièrement intégré à LolRogue. Les joueurs doivent créer un compte ou se connecter pour sauvegarder leur progression, sauf s'ils choisissent le mode "Invité".

## 📁 Fichiers Créés

### Backend (Base de données)
- ✅ `supabase/migrations/001_create_player_accounts.sql` - Tables de base de données
- ✅ `src/services/supabaseClient.ts` - Client Supabase et fonctions helper
- ✅ `src/types/database.ts` - Types TypeScript pour la base de données

### Frontend (Interface)
- ✅ `src/stores/authStore.ts` - Store Zustand pour l'état d'authentification
- ✅ `src/pages/AuthPage.tsx` - Page de connexion/inscription
- ✅ `src/components/ProtectedRoute.tsx` - Composant pour protéger les routes
- ✅ `src/styles/auth.css` - Styles pour la page d'authentification
- ✅ `src/pages/MenuPage.tsx` - Mis à jour avec info utilisateur et déconnexion
- ✅ `src/styles/main-menu.css` - Styles utilisateur ajoutés
- ✅ `src/stores/routerStore.ts` - Route `/auth` ajoutée
- ✅ `src/App.tsx` - Routes protégées configurées

## 🚀 Comment Configurer

### Étape 1: Appliquer la Migration SQL

Suivez les instructions dans `SETUP_SUPABASE.md` pour créer les tables dans votre base de données Supabase.

### Étape 2: Configurer les Variables d'Environnement

Assurez-vous que votre fichier `.env` contient:

```env
VITE_SUPABASE_URL=https://curffughsmpukeprryaq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Étape 3: Installer les Dépendances

```bash
npm install
```

### Étape 4: Tester

1. Démarrez l'application: `npm run dev`
2. Essayez de vous inscrire avec un email et mot de passe
3. Vérifiez que vous êtes redirigé vers le menu principal
4. Testez le mode "Invité" en cliquant sur "Play as Guest"

## 🔐 Fonctionnement

### Inscription (Sign Up)
1. L'utilisateur remplit: email, mot de passe, pseudo (et nom d'affichage optionnel)
2. Un compte Supabase Auth est créé
3. Le trigger `handle_new_user` crée automatiquement une entrée dans `players`
4. L'utilisateur est connecté et redirigé vers le menu

### Connexion (Login)
1. L'utilisateur entre email et mot de passe
2. Supabase Auth authentifie
3. Les données du joueur sont chargées depuis la table `players`
4. Le timestamp `last_login_at` is mis à jour
5. Redirection vers le menu ou la run en cours

### Mode Invité (Guest)
1. L'utilisateur clique sur "Play as Guest"
2. Aucune authentification n'est requise
3. La progression est sauvegardée localement (localStorage)
4. Les données ne sont pas persistées sur le serveur

### Déconnexion (Logout)
1. L'utilisateur clique sur "Logout" dans le menu
2. La session Supabase est terminée
3. Toute run en cours is terminée
4. Redirection vers la page de connexion

## 🛡️ Sécurité

### Row Level Security (RLS)
- Chaque utilisateur ne peut voir/modifier que ses propres données
- Les triggers de sécurité sont automatiquement activés
- Les politiques RLS sont configurées pour toutes les tables

### Protection des Routes
- Toutes les routes de jeu sont protégées par `ProtectedRoute`
- Seule la route `/auth` est accessible sans authentification
- Le mode invité est géré par le store local

## 📊 Données Sauvegardées

### Pour les Utilisateurs Connectés
- ✅ Progression de maîtrise par champion
- ✅ Historique des runs
- ✅ Statistiques globales
- ✅ Contenus débloqués (starters, skins)
- ✅ Runs quotidiens
- ✅ Classement (leaderboard)

### Pour les Invités
- ✅ Run en cours (localStorage)
- ✅ Maîtrise locale (localStorage)
- ❌ Pas de persistance serveur
- ❌ Pas de leaderboard
- ❌ Pas de progression entre sessions

## 🔄 Synchronisation

### Au Démarrage
1. Le composant `ProtectedRoute` vérifie la session
2. Si connecté, les données du joueur sont chargées
3. Si une run est en cours, redirection vers `/run`
4. Sinon, redirection vers `/` (menu)

### Pendant le Jeu
- Les données sont sauvegardées automatiquement via `supabaseClient`
- Exemple: après une run, les stats sont envoyées à la base de données
- La maîtrise est mise à jour après chaque run

## 🎮 Intégration avec le Jeu

### Sauvegarder une Run
```typescript
import { createRun, addRunTeamMembers } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';

const { user } = useAuthStore();
if (user) {
  await createRun({
    player_id: user.id,
    run_uuid: runData.runId,
    won: runData.won,
    // ... autres données
  });
}
```

### Mettre à jour la Maîtrise
```typescript
import { upsertChampionMastery } from '@/services/supabaseClient';

await upsertChampionMastery(playerId, championId, {
  total_candies: newTotal,
  mastery_level: newLevel,
  // ...
});
```

## 🧪 Tests Recommandés

1. **Inscription**
   - [ ] Créer un compte avec email valide
   - [ ] Vérifier l'email de confirmation (si activé)
   - [ ] Se connecter avec les identifiants

2. **Connexion/Déconnexion**
   - [ ] Se connecter avec email/mot de passe
   - [ ] Vérifier que les données sont chargées
   - [ ] Se déconnecter et vérifier la redirection

3. **Mode Invité**
   - [ ] Cliquer sur "Play as Guest"
   - [ ] Démarrer une run
   - [ ] Vérifier que c'est sauvegardé localement

4. **Protection des Routes**
   - [ ] Essayer d'accéder à `/run` sans être connecté
   - [ ] Vérifier la redirection vers `/auth`
   - [ ] Se connecter et réessayer

5. **Persistance**
   - [ ] Commencer une run
   - [ ] Rafraîchir la page
   - [ ] Vérifier que la run est toujours là

## 🔧 Dépannage

### "Missing environment variables"
- Vérifiez que `.env` existe avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`

### "Failed to fetch" / Erreur de connexion
- Vérifiez que votre projet Supabase is actif
- Vérifiez les URLs dans `.env`

### "Invalid login credentials"
- Vérifiez email/mot de passe
- Si inscription récente, vérifiez la confirmation email

### Les données ne se sauvegardent pas
- Vérifiez les politiques RLS dans Supabase
- Vérifiez que l'utilisateur est connecté (`useAuthStore`)
- Consultez la console pour les erreurs

### Redirect inattendue vers /auth
- Vérifiez `isAuthenticated` dans `useAuthStore`
- Vérifiez que la session n'a pas expiré

## 📖 Ressources

- [Documentation Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)

## ✅ Checklist Finale

- [ ] Migration SQL appliquée avec succès
- [ ] Tables visibles dans Supabase Table Editor
- [ ] Fichier `.env` configuré avec les bonnes clés
- [ ] Dépendances installées (`@supabase/supabase-js`)
- [ ] Application démarre sans erreurs
- [ ] Page d'authentification accessible sur `/auth`
- [ ] Inscription fonctionne
- [ ] Connexion fonctionne
- [ ] Mode invité fonctionne
- [ ] Déconnexion fonctionne
- [ ] Routes protégées redirigent correctement
- [ ] Menu affiche les infos utilisateur
- [ ] Tests de persistance réussis

---

**Prochaines étapes recommandées:**
1. Configurer la confirmation par email dans Supabase
2. Ajouter la réinitialisation de mot de passe
3. Implémenter la sauvegarde automatique des runs
4. Ajouter les statistiques et leaderboard dans le menu
5. Créer un profil utilisateur avec historique

**Besoin d'aide?** Consultez la documentation Supabase ou la communauté Discord.