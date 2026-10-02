#!/usr/bin/env node
/**
 * Forward-only migration runner.
 *
 *   npm run db:migrate
 *
 * Deliberately tiny: it reads `db/migrations/*.sql` in filename order and applies each one inside a
 * transaction, recording name + checksum in `schema_migrations`. An advisory lock serialises
 * concurrent runs so two instances booting at the same time during a deploy cannot both apply the
 * same file.
 *
 * There is no `down`. Rolling back a schema change by hand is slower than rolling forward with a new
 * file, and an automatic down-migration routinely loses data that the up-migration transformed.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

// Arbitrary but fixed: any process running migrations must block on this lock.
const ADVISORY_LOCK_KEY = 8_392_004_117n;
const LOCK_TIMEOUT_MS = 10_000;

function fail(message) {
  process.stderr.write(`\n  Migration failed: ${message}\n\n`);
  process.exit(1);
}

async function acquireLock(client) {
  const { rows } = await client.query(
    `SELECT pg_try_advisory_lock($1::bigint) AS acquired`,
    [ADVISORY_LOCK_KEY.toString()],
  );
  if (!rows[0].acquired) fail('another process is already running migrations (advisory lock held)');
}

async function ensureRegistry(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    fail('DATABASE_URL is not set. Copy .env.example to .env and point it at your PostgreSQL instance.');
  }

  const client = new pg.Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    await acquireLock(client);
    await ensureRegistry(client);

    const applied = await client.query('SELECT name, checksum FROM schema_migrations');
    const appliedMap = new Map(applied.rows.map((row) => [row.name, row.checksum]));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) fail(`no .sql files found in ${MIGRATIONS_DIR}`);

    // A file that changed after it was applied means two environments now disagree about the
    // schema. Loud failure beats silently diverging prod from local.
    for (const [name, checksum] of appliedMap) {
      if (!files.includes(name)) {
        process.stderr.write(`  ! ${name} is applied here but missing from ${MIGRATIONS_DIR}\n`);
      }
    }

    let count = 0;
    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = appliedMap.get(file);

      if (previous) {
        if (previous !== checksum) {
          fail(`${file} has changed since it was applied (checksum drift). Add a new migration instead.`);
        }
        continue;
      }

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          file,
          checksum,
        ]);
        await client.query('COMMIT');
        process.stdout.write(`  applied ${file}\n`);
        count += 1;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        fail(`${file}\n${error instanceof Error ? error.message : String(error)}`);
      }
    }

    process.stdout.write(
      count === 0 ? '  database already up to date\n' : `  done — ${count} migration(s) applied\n`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));