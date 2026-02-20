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
  }
});

export async function initDatabase() {
  try {
    await db.migrate.latest();
    logger.info('Database migrations completed');
    return db;
  } catch (error) {
    logger.error('Database migration failed:', error);
    throw error;
  }
}

export default db;
