import db, { initDatabase } from './index.js';

async function runMigrations() {
  try {
    console.log('Running database migrations...');
    await initDatabase();
    console.log('✅ Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

runMigrations();
