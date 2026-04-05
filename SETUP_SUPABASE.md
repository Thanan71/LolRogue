# Configuration de la Base de Données Supabase pour LolRogue

Ce guide vous explique comment configurer les tables de compte joueur dans votre base de données Supabase.

## 📋 Vue d'ensemble

Le schéma de base de données comprend les tables suivantes :

- **players** : Informations du compte joueur (lié à Supabase auth)
- **champion_mastery** : Progression de maîtrise par champion
- **player_unlocks** : Contenus débloqués (starters et skins)
- **runs** : Historique des runs complétés
- **run_team_members** : Champions utilisés dans chaque run
- **daily_runs** : Runs quotidiens et scores
- **leaderboard** : Vue publique du classement

## 🚀 Instructions d'Installation

### Étape 1: Exécuter la Migration SQL

**Option A - Via le Dashboard Supabase (Recommandé)**

1. Allez sur https://supabase.com et sélectionnez votre projet
2. Cliquez sur "SQL Editor" dans la barre latérale gauche
3. Cliquez sur "New query"
4. Copiez le contenu complet de `supabase/migrations/001_create_player_accounts.sql`
5. Collez-le dans l'éditeur SQL
6. Cliquez sur "Run" pour exécuter

**Option B - Via Supabase CLI**

```bash
# Installer Supabase CLI
npm install -g supabase

# Se connecter à Supabase
supabase login

# Lier à votre projet existant
supabase link --project-ref curffughsmpukeprryaq

# Appliquer les migrations
supabase db push
```

**Option C - Connexion PostgreSQL Directe**

```bash
# Se connecter avec psql
psql "postgres://postgres.curffughsmpukeprryaq:E4138Q3AJP8T9rRs@aws-1-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=require"

# Exécuter le fichier de migration
\i supabase/migrations/001_create_player_accounts.sql
```

### Étape 2: Configurer les Variables d'Environnement

1. Copiez le fichier `.env.example` vers `.env` :
```bash
cp .env.example .env
```

2. Les variables sont déjà pré-remplies avec vos clés. Vérifiez qu'elles correspondent à votre projet Supabase.

### Étape 3: Installer les Dépendances

```bash
npm install
```

Cela installera `@supabase/supabase-js` qui a été ajouté au projet.

### Étape 4: Vérifier l'Installation

1. **Vérifier les tables dans le Dashboard**
   - Allez dans "Table Editor" sur Supabase
   - Vous devriez voir toutes les nouvelles tables

2. **Tester la connexion**
   - Démarrez votre application : `npm run dev`
   - Ouvrez la console du navigateur
   - Devrait afficher le client Supabase initialisé sans erreurs

## 🗄️ Schéma de Base de Données

### Table: players
```sql
- id: UUID (clé primaire)
- user_id: UUID (lié à auth.users)
- username: string (unique)
- display_name: string
- avatar_url: string
- level: integer
- total_candies: integer
- total_runs_completed: integer
- total_wins: integer
- total_waves_completed: integer
- created_at: timestamp
- updated_at: timestamp
- last_login_at: timestamp
```

### Table: champion_mastery
```sql
- id: UUID (clé primaire)
- player_id: UUID (foreign key)
- champion_id: string
- total_candies: integer
- mastery_level: integer (0-4)
- current_level_candies: integer
- unlocked_ids: text[]
- games_played: integer
- games_won: integer
- total_kills: integer
- total_damage_dealt: bigint
- created_at: timestamp
- updated_at: timestamp
```

### Table: runs
```sql
- id: UUID (clé primaire)
- player_id: UUID (foreign key)
- run_uuid: string (unique)
- won: boolean
- run_level: integer
- waves_completed: integer
- biomes_visited: text[]
- gold_earned: integer
- total_kills: integer
- total_damage_dealt: bigint
- candies_earned: integer
- started_at: timestamp
- completed_at: timestamp
- duration_seconds: integer (calculé)
```

## 🔒 Sécurité

### Row Level Security (RLS)

Toutes les tables ont RLS activé avec des politiques qui garantissent :
- Les utilisateurs ne peuvent voir que leurs propres données
- Les joueurs peuvent modifier leur propre profil
- Les données de runs sont privées
- Le leaderboard est accessible publiquement

### Déclencheurs Automatiques

- `update_updated_at_column` : Met à jour automatiquement les timestamps
- `handle_new_user` : Crée un enregistrement player lors de l'inscription
- `on_auth_user_created` : Lie le système d'authentification Supabase

## 📚 Utilisation dans le Code

### Exemple: Récupérer les données du joueur

```typescript
import { getPlayer, getCurrentUser } from '@/services/supabaseClient';

async function loadPlayerData() {
  const user = await getCurrentUser();
  if (user) {
    const { data: player } = await getPlayer(user.id);
    console.log('Player data:', player);
  }
}
```

### Exemple: Sauvegarder un run

```typescript
import { createRun, addRunTeamMembers } from '@/services/supabaseClient';

async function saveRun(runData, teamMembers, userId) {
  // Créer le run
  const { data: run, error } = await createRun({
    player_id: userId,
    run_uuid: runData.runId,
    won: runData.won,
    run_level: runData.runLevel,
    waves_completed: runData.totalWavesCompleted,
    biomes_visited: runData.biomesVisited,
    gold_earned: runData.gold,
    total_kills: runData.totalKills,
    total_damage_dealt: runData.totalDamage,
    candies_earned: runData.candiesEarned,
    started_at: runData.startedAt,
    completed_at: new Date().toISOString(),
  });

  if (run && teamMembers.length > 0) {
    // Ajouter les membres de l'équipe
    await addRunTeamMembers(teamMembers.map(member => ({
      run_id: run.id,
      champion_id: member.championId,
      final_level: member.level,
      final_hp: member.currentHp,
      survived: member.survived,
      kills: member.kills,
      damage_dealt: member.damageDealt,
    })));
  }

  return { run, error };
}
```

### Exemple: Mettre à jour la maîtrise d'un champion

```typescript
import { upsertChampionMastery } from '@/services/supabaseClient';

async function updateChampionMastery(playerId, championId, candiesEarned) {
  const { data, error } = await upsertChampionMastery(
    playerId,
    championId,
    {
      total_candies: candiesEarned,
      mastery_level: calculateMasteryLevel(candiesEarned),
      current_level_candies: candiesEarned % 50, // Exemple simplifié
      games_played: 1,
      games_won: 0,
    }
  );

  return { data, error };
}
```

## 🧪 Tests

Pour tester votre configuration :

1. **Créer un utilisateur test** via l'interface d'authentification
2. **Vérifier** qu'un enregistrement `player` a été créé automatiquement
3. **Tester RLS** en essayant d'accéder aux données d'un autre utilisateur (devrait échouer)
4. **Insérer des données test** pour les runs et la maîtrise
5. **Consulter le leaderboard** pour vérifier qu'il est accessible

## 🔧 Dépannage

### Erreur: "relation already exists"
Les tables existent déjà. Soit vous les supprimez d'abord, soit modifiez la migration pour utiliser `DROP TABLE IF EXISTS`.

### Erreur: "permission denied"
- Vérifiez que vous utilisez les bonnes credentials (clé de rôle service pour accès complet)
- Vérifiez que les politiques RLS sont correctement configurées

### Erreur: "Missing environment variables"
- Assurez-vous que le fichier `.env` existe et contient `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`

### Le client Supabase ne se connecte pas
- Vérifiez que `@supabase/supabase-js` est installé : `npm list @supabase/supabase-js`
- Vérifiez que les URLs et clés dans `.env` sont correctes

## 📖 Ressources Additionnelles

- [Documentation Supabase](https://supabase.com/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Documentation PostgreSQL](https://www.postgresql.org/docs/)

## ✅ Checklist de Configuration

- [ ] Migration SQL exécutée avec succès
- [ ] Tables visibles dans le Table Editor
- [ ] Fichier `.env` créé avec les bonnes valeurs
- [ ] Dépendances npm installées (`@supabase/supabase-js`)
- [ ] Types TypeScript générés (`src/types/database.ts`)
- [ ] Client Supabase configuré (`src/services/supabaseClient.ts`)
- [ ] Tests de connexion effectués
- [ ] Politiques RLS vérifiées

## 🎯 Prochaines Étapes

1. **Intégrer l'authentification** dans votre application React
2. **Créer des composants** pour l'inscription/connexion
3. **Implémenter la sauvegarde automatique** des runs
4. **Ajouter le suivi de progression** de maîtrise
5. **Créer un leaderboard** en temps réel
6. **Configurer les notifications** pour les achievements

---

**Besoin d'aide ?** Consultez la documentation Supabase ou la communauté Discord.