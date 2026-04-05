/**
 * Database Migration Script for LolRogue
 * 
 * This script checks the current database version and applies only the necessary migrations.
 * It creates a schema_migrations table to track which migrations have been applied.
 * 
 * Usage: npm run migrate
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration from environment variables
const dbConfig = {
  host: process.env.STORAGE_POSTGRES_HOST || 'db.curffughsmpukeprryaq.supabase.co',
  port: 5432,
  database: process.env.STORAGE_POSTGRES_DATABASE || 'postgres',
  user: process.env.STORAGE_POSTGRES_USER || 'postgres',
  password: process.env.STORAGE_POSTGRES_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
};

// Migrations directory
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

/**
 * Get list of applied migrations from the database
 */
async function getAppliedMigrations(client) {
  try {
    // Check if schema_migrations table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      // Create schema_migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
          checksum VARCHAR(64),
          applied_by VARCHAR(255) DEFAULT 'migration_script'
        );
      `);
      console.log('✅ Created schema_migrations table');
      return [];
    }

    const result = await client.query(`
      SELECT version FROM public.schema_migrations 
      ORDER BY version ASC;
    `);

    return result.rows.map(row => row.version);
  } catch (error) {
    console.error('❌ Error checking migrations table:', error.message);
    throw error;
  }
}

/**
 * Get list of migration files from the migrations directory
 */
function getMigrationFiles() {
  try {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log('⚠️  Migrations directory not found:', MIGRATIONS_DIR);
      return [];
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort alphabetically (001, 002, etc.)

    return files.map(file => {
      const version = file.replace('.sql', '');
      const filePath = path.join(MIGRATIONS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      return {
        version,
        fileName: file,
        filePath,
        content,
        checksum: crypto.createHash('md5').update(content).digest('hex') // Simple checksum
      };
    });
  } catch (error) {
    console.error('❌ Error reading migration files:', error.message);
    throw error;
  }
}

/**
 * Apply a single migration
 */
async function applyMigration(client, migration) {
  console.log(`🔄 Applying migration ${migration.version}: ${migration.fileName}...`);
  
  try {
    // Start transaction
    await client.query('BEGIN');

    // Execute the migration SQL
    await client.query(migration.content);

    // Record the migration in schema_migrations
    await client.query(`
      INSERT INTO public.schema_migrations (version, checksum)
      VALUES ($1, $2)
      ON CONFLICT (version) DO NOTHING;
    `, [migration.version, migration.checksum]);

    // Commit transaction
    await client.query('COMMIT');

    console.log(`✅ Successfully applied migration ${migration.version}`);
    return true;
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error(`❌ Failed to apply migration ${migration.version}:`, error.message);
    throw error;
  }
}

/**
 * Main migration function
 */
async function runMigrations() {
  console.log('🚀 Starting database migrations...\n');

  // Validate environment variables
  if (!dbConfig.password) {
    console.error('❌ Missing database password. Please set STORAGE_POSTGRES_PASSWORD in .env');
    process.exit(1);
  }

  const client = new Client(dbConfig);

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database\n');

    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(client);
    console.log(`📋 Found ${appliedMigrations.length} applied migrations:`, appliedMigrations);

    // Get migration files
    const migrationFiles = getMigrationFiles();
    console.log(`📁 Found ${migrationFiles.length} migration files\n`);

    if (migrationFiles.length === 0) {
      console.log('✨ No migrations to apply. Database is up to date!');
      return;
    }

    // Filter migrations that need to be applied
    const pendingMigrations = migrationFiles.filter(
      migration => !appliedMigrations.includes(migration.version)
    );

    if (pendingMigrations.length === 0) {
      console.log('✨ All migrations have been applied. Database is up to date!');
      return;
    }

    console.log(`🔧 Applying ${pendingMigrations.length} pending migration(s):\n`);

    // Apply each pending migration
    for (const migration of pendingMigrations) {
      await applyMigration(client, migration);
      console.log(''); // Empty line for readability
    }

    console.log('🎉 All migrations applied successfully!');
    console.log(`📊 Database version: ${pendingMigrations[pendingMigrations.length - 1].version}`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('👋 Database connection closed.');
  }
}

// Run the migrations
runMigrations()
  .then(() => {
    console.log('\n✅ Migration script completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Migration script failed:', error.message);
    process.exit(1);
  });