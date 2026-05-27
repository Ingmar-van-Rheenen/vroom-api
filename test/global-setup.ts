import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://vroom:vroom@localhost:5432/vroom_test';

/**
 * Draait eenmalig voor de hele test-run: zorgt dat de test-database bestaat
 * en voert alle migraties uit. Verbindt eerst met de standaard 'postgres'
 * database omdat CREATE DATABASE niet binnen de doel-db kan.
 */
export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);

  if (!dbName.includes('test')) {
    throw new Error(
      `Weiger te draaien: test-database "${dbName}" bevat niet "test". Bescherming tegen het wissen van echte data.`,
    );
  }

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.toString(), { max: 1 });
  try {
    const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (exists.length === 0) {
      await admin.unsafe(`create database "${dbName}"`);
    }
  } finally {
    await admin.end();
  }

  const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  } finally {
    await client.end();
  }
}
