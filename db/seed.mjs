#!/usr/bin/env node
/**
 * Development seed.
 *
 *   npm run db:seed
 *
 * Creates one account per role so the role column, the permission map and the campaign flow can all
 * be exercised locally, plus a few venues so the admin console has something to show on a fresh clone
 * rather than an empty table. Idempotent: re-running updates the seeded rows and touches nothing else.
 *
 * These are development credentials with development passwords. Nothing here is written to a real
 * database — the script refuses to run when NODE_ENV is production.
 */

import pg from 'pg';

const SEED_USERS = [
  { email: 'ada@stringtheory.test', fullName: 'Ada Okafor', role: 'BRAND', phone: '+44 20 7946 0001' },
  { email: 'cafe@stringtheory.test', fullName: 'Northside Coffee', role: 'STORE', phone: '+44 20 7946 0002' },
  { email: 'ops@stringtheory.test', fullName: 'String Theory Operations', role: 'ADMIN', phone: null },
];

/**
 * Venues, so /admin has rows to show on a fresh clone.
 *
 * Keyed on slug rather than name because slug is the unique index, which makes the conflict target
 * unambiguous and the upsert idempotent without a lookup first. The STORE account is attached as owner
 * so the console's "has an account" column is exercised in both states — the venues added through the
 * console have no owner, and seeing the difference is the point of the column.
 */
const SEED_STORES = [
  { slug: 'northside-coffee', name: 'Northside Coffee', location: '12 Bridge Street, ground floor', screenCount: 6, owner: 'cafe@stringtheory.test', contactName: 'Northside Coffee', contactPhone: '+44 20 7946 0002' },
  { slug: 'the-pumphouse-bar', name: 'The Pumphouse Bar', location: '4 Mill Lane, by the escalators', screenCount: 11, owner: null, contactName: 'Rowan Ellis', contactPhone: '+44 20 7946 0003' },
  { slug: 'riverside-gym', name: 'Riverside Gym', location: 'Riverside Retail Park, unit 7', screenCount: 24, owner: null, contactName: 'Samir Patel', contactPhone: '+44 20 7946 0004' },
  { slug: 'corner-shop-221', name: 'Corner Shop 221', location: '221 High Road', screenCount: 3, owner: null, contactName: null, contactPhone: null },
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    process.stderr.write('\n  Refusing to seed a production database.\n\n');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    process.stderr.write('\n  DATABASE_URL is not set. Copy .env.example to .env first.\n\n');
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    // ON CONFLICT DO UPDATE rather than DO NOTHING: re-running should leave the display name and
    // phone in step with this file instead of silently doing nothing.
    for (const user of SEED_USERS) {
      await client.query(
        `INSERT INTO users (email, full_name, phone, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE
           SET full_name = EXCLUDED.full_name,
               phone = EXCLUDED.phone,
               role = EXCLUDED.role`,
        [user.email, user.fullName, user.phone, user.role],
      );
      process.stdout.write(`  ${user.role.padEnd(5)} ${user.email}\n`);
    }

    // Stores have no unique constraint on name, only on slug, so the upsert keys on slug: re-running
    // updates the venue rather than adding a second "Riverside Gym" every time the seed is run.
    for (const store of SEED_STORES) {
      const owner = store.owner ? await findUserId(client, store.owner) : null;

      await client.query(
        `INSERT INTO stores (
           name, slug, location, screen_count, owner_user_id, contact_name, contact_email, contact_phone, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name,
               location = EXCLUDED.location,
               screen_count = EXCLUDED.screen_count,
               owner_user_id = EXCLUDED.owner_user_id,
               contact_name = EXCLUDED.contact_name,
               contact_email = EXCLUDED.contact_email,
               contact_phone = EXCLUDED.contact_phone`,
        [
          store.name,
          store.slug,
          store.location,
          store.screenCount,
          owner,
          store.contactName,
          store.contactName === null ? 'hello@venue.test' : `${store.slug}@stringtheory.test`,
          store.contactPhone,
        ],
      );
      process.stdout.write(`  STORE ${store.name} (${store.screenCount} screens)\n`);
    }

    process.stdout.write(
      [
        '',
        '  Seeded accounts above. Set DEV_AUTH_EMAIL in .env to one of them to act as that role:',
        '',
        '    DEV_AUTH_EMAIL=ada@stringtheory.test    # BRAND — can create campaigns',
        '    DEV_AUTH_EMAIL=cafe@stringtheory.test  # STORE — refused with a 403',
        '    DEV_AUTH_EMAIL=ops@stringtheory.test   # ADMIN — can manage the network at /admin',
        '',
        '  /admin signs in with ADMIN_USERNAME / ADMIN_PASSWORD from .env (default: admin / admin).',
        '',
      ].join('\n'),
    );
  } finally {
    await client.end().catch(() => {});
  }
}

/** Id of a seeded account by email, or null when it is not present. */
async function findUserId(client, email) {
  const result = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  return result.rows[0]?.id ?? null;
}

main().catch((error) => {
  process.stderr.write(`\n  Seed failed: ${error instanceof Error ? error.message : String(error)}\n\n`);
  process.exit(1);
});