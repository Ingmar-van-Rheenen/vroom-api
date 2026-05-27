import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../env.js';

const migrationClient = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
const db = drizzle(migrationClient);

console.log('Running migrations...');
await migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrations complete.');

await migrationClient.end();
