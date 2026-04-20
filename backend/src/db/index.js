import knex from 'knex';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = process.env.DB_PATH 
  ? dirname(process.env.DB_PATH) 
  : join(__dirname, '../../data');

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || join(dataDir, 'coach.db');

const db = knex({
  client: 'sqlite3',
  connection: {
    filename: dbPath
  },
  useNullAsDefault: true,
  migrations: {
    directory: join(__dirname, 'migrations'),
    tableName: 'knex_migrations'
  },
  pool: {
    afterCreate: (conn, done) => {
      // Run PRAGMA foreign_key_list on a key table to force SQLite to rebuild its
      // internal schema cache for this connection.  This is necessary because
      // migration 20260403 does a full table rename of `activities`
      // (activities → activities_old → new activities) and SQLite's per-connection
      // FK resolution table can end up with a stale rootpage reference to the
      // no-longer-existing `activities_old` table, causing SQLITE_ERROR on INSERT
      // into tables that have an FK pointing at `activities`.
      conn.run('PRAGMA foreign_key_list(planned_activities)', (cacheRefreshErr) => {
        if (cacheRefreshErr) {
          // non-fatal — log and continue
          logger.warn('Schema cache refresh failed:', cacheRefreshErr.message);
        }
        // Now enable foreign key constraints
        conn.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) {
            logger.error('Failed to enable foreign keys:', err);
          } else {
            logger.info('Foreign key constraints enabled');
          }
          done(err, conn);
        });
      });
    }
  }
});

/**
 * Run migrations on a dedicated, short-lived Knex instance.
 *
 * SQLite's internal FK resolution table is compiled per-connection and cached.
 * When migrations do table renames (e.g. 20260403 renames `activities` →
 * `activities_old` → new `activities`), the FK cache on that connection becomes
 * stale: FK refs to `activities` still point to the old rootpage that was later
 * renamed to `activities_old` and dropped.  Any subsequent INSERT that triggers
 * FK enforcement on that connection then fails with "no such table: activities_old".
 *
 * Running migrations on a SEPARATE knex instance and destroying it before the
 * app's main pool ever opens guarantees the app always starts with a fresh,
 * fully-up-to-date schema cache.
 */
async function runMigrations() {
  const migrationKnex = knex({
    client: 'sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true,
    migrations: {
      directory: join(__dirname, 'migrations'),
      tableName: 'knex_migrations'
    }
  });
  try {
    await migrationKnex.migrate.latest();
  } finally {
    await migrationKnex.destroy();
  }
}

export async function initDatabase() {
  try {
    await runMigrations();
    logger.info('Database migrations completed');
    return db;
  } catch (error) {
    logger.error('Database migration failed:', error);
    throw error;
  }
}

export default db;
