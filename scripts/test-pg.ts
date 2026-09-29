import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';

import fs from 'fs';

async function main() {
  console.log('Testing Embedded Postgres on Windows...');
  const dataDir = './.pgdata';
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: 5432,
    user: 'postgres',
    password: '',
    persistent: true,
  });

  try {
    if (!fs.existsSync(`${dataDir}/PG_VERSION`)) {
      await pg.initialise();
      console.log('Postgres initialised successfully.');
    } else {
      console.log('Postgres data directory already initialized.');
    }
    await pg.start();
    console.log('Postgres started successfully on port 5432.');

    // Connect to postgres database to ensure polarlink exists
    const rootClient = new Client({
      connectionString: 'postgresql://polaruser:polarpassword@localhost:5432/postgres',
    });
    await rootClient.connect();
    const dbCheck = await rootClient.query("SELECT 1 FROM pg_database WHERE datname = 'polarlink'");
    if (dbCheck.rowCount === 0) {
      await rootClient.query('CREATE DATABASE polarlink');
      console.log('Created database polarlink.');
    }
    await rootClient.end();

    const client = new Client({
      connectionString: 'postgresql://polaruser:polarpassword@localhost:5432/polarlink',
    });
    await client.connect();
    const res = await client.query('SELECT version();');
    console.log('Connected to polarlink! Version:', res.rows[0].version);
    await client.end();

    await pg.stop();
    console.log('Postgres stopped cleanly.');
  } catch (err) {
    console.error('Error starting postgres:', err);
    process.exit(1);
  }
}

main();
