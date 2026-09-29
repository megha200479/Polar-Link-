import fs from 'fs';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';

const dataDir = './.pgdata';
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: 5432,
  user: 'polaruser',
  password: 'polarpassword',
  persistent: true,
});

async function run() {
  if (!fs.existsSync(`${dataDir}/PG_VERSION`)) {
    console.log('[PG] Initialising PostgreSQL data directory...');
    await pg.initialise();
  }
  console.log('[PG] Starting PostgreSQL on port 5432...');
  await pg.start();
  console.log('[PG] PostgreSQL started on port 5432.');

  const rootClient = new Client({
    connectionString: 'postgresql://polaruser:polarpassword@localhost:5432/postgres',
  });
  await rootClient.connect();
  const dbCheck = await rootClient.query("SELECT 1 FROM pg_database WHERE datname = 'polarlink'");
  if (dbCheck.rowCount === 0) {
    await rootClient.query('CREATE DATABASE polarlink');
    console.log('[PG] Created database "polarlink".');
  } else {
    console.log('[PG] Database "polarlink" ready.');
  }
  await rootClient.end();

  console.log('[PG] Database ready for connections at postgresql://polaruser:polarpassword@localhost:5432/polarlink');

  const shutdown = async () => {
    console.log('\n[PG] Stopping PostgreSQL gracefully...');
    await pg.stop();
    console.log('[PG] PostgreSQL stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

run().catch((err) => {
  console.error('[PG] Fatal error:', err);
  process.exit(1);
});
