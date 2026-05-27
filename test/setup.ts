import { sql } from 'drizzle-orm';
import { afterAll, beforeEach } from 'vitest';
import { closeDb, db } from '../src/db/client.js';
import { env } from '../src/env.js';
import { resetRateLimits } from '../src/lib/rate-limit.js';

// Extra vangnet: faal hard als we per ongeluk niet tegen een test-db draaien.
if (!env.DATABASE_URL.includes('test')) {
  throw new Error(`Tests moeten tegen een test-database draaien, niet ${env.DATABASE_URL}`);
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table groep_invites, groep_leden, groepen, sessions, magic_links, users restart identity cascade`,
  );
  resetRateLimits();
});

afterAll(async () => {
  await closeDb();
});
