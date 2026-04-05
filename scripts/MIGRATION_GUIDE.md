# Guide du Script de Migration de Base de Données

## 🎯 Vue d'ensemble

Le script `migrate-db.js` permet d'appliquer automatiquement les migrations SQL à votre base de données Supabase. Il vérifie quelles migrations ont déjà été appliquées et n'exécute que celles qui sont nouvelles.

## 📁 Fichiers de Migration

Les fichiers de migration sont situés dans `supabase/migrations/` et suivent la convention de nommage :
- `001_create_player_accounts.sql`
- `002_add_new_feature.sql`
- etc.

Le numéro au début (001, 002, etc.) détermine l'ordre d'exécution.

## 🚀 Utilisation

### Exécuter les migrations

```bash
npm run migrate
```

Le script va :
1. Se connecter à la base de données
2. Créer la table `schema_migrations` si elle n'existe pas
3. Vérifier quelles migrations ont déjà été appliquées
4. Appliquer uniquement les migrations en attente
5. Enregistrer chaque migration appliquée dans `schema_migrations`

### Exemple de sortie

```
🚀 Starting database migrations...

📡 Connecting to database...
✅ Connected to database

📋 Found 0 applied migrations:
📁 Found 1 migration files

🔧 Applying 1 pending migration(s):

🔄 Applying migration 001: 001_create_player_accounts.sql...
✅ Created schema_migrations table
✅ Successfully applied migration 001

🎉 All migrations applied successfully!
📊 Database version: 001

👋 Database connection closed.

✅ Migration script completed successfully!
```

## 🔧 Configuration

Le script utilise les variables d'environnement suivantes (déjà dans votre `.env`) :

- `STORAGE_POSTGRES_HOST` - Hôte de la base de données
- `STORAGE_POSTGRES_DATABASE` - Nom de la base de données
- `STORAGE_POSTGRES_USER` - Utilisateur de la base de données
- `STORAGE_POSTGRES_PASSWORD` - Mot de passe de la base de données

## 📊 Table schema_migrations

Le script crée automatiquement une table `schema_migrations` pour suivre l'historique :

```sql
CREATE TABLE public.schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    checksum VARCHAR(64),
    applied_by VARCHAR(255) DEFAULT 'migration_script'
);
```

Cette table contient :
- `version` - Le nom du fichier de migration (ex: `001`)
- `applied_at` - Quand la migration a été appliquée
- `checksum` - Hash MD5 du contenu SQL (pour détecter les modifications)
- `applied_by` - Qui/quoi a appliqué la migration

## 🆕 Ajouter une Nouvelle Migration

1. Créez un nouveau fichier SQL dans `supabase/migrations/`
2. Nommez-le avec le prochain numéro séquentiel (ex: `002_add_scores.sql`)
3. Écrivez votre SQL dans le fichier
4. Exécutez `npm run migrate`

### Exemple de migration

```sql
-- supabase/migrations/002_add_scores.sql

-- Add scores table
CREATE TABLE IF NOT EXISTS public.scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_scores_player_id ON public.scores(player_id);
CREATE INDEX IF NOT EXISTS idx_scores_created_at ON public.scores(created_at DESC);
```

## ⚠️ Important

- **Ne modifiez jamais** une migration déjà appliquée (le checksum détecterait le changement)
- **Toujours créer** une nouvelle migration pour les modifications
- **Tester** les migrations sur un environnement de test avant la production
- **Backup** de la base de données avant d'appliquer des migrations en production

## 🔍 Vérifier l'État des Migrations

Pour voir quelles migrations ont été appliquées :

```sql
SELECT version, applied_at, checksum 
FROM public.schema_migrations 
ORDER BY version ASC;
```

## 🛠️ Dépannage

### Erreur: "Missing database password"
- Vérifiez que `STORAGE_POSTGRES_PASSWORD` est défini dans `.env`

### Erreur: "relation already exists"
- La migration essaie de créer une table qui existe déjà
- Utilisez `CREATE TABLE IF NOT EXISTS` dans vos migrations

### Erreur: "connection refused"
- Vérifiez que les paramètres de connexion dans `.env` sont corrects
- Vérifiez que votre projet Supabase est actif

### Migration échouée en cours d'exécution
- Les migrations sont exécutées dans des transactions
- En cas d'erreur, la transaction est rollback automatiquement
- Corrigez le fichier SQL et réexécutez `npm run migrate`

## 📖 Ressources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Database Migrations Best Practices](https://martinfowler.com/articles/evodb.html)