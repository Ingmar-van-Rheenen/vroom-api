import { and, eq, isNull } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db } from '../db/client.js';
import { autos, groepLeden, type Auto, type GroepLid } from '../db/schema.js';
import { errors } from '../lib/errors.js';
import type { AuthVariables } from './middleware.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AutoVariables = AuthVariables & {
  auto: Auto;
  lid: GroepLid;
};

/**
 * Verleent toegang tot een auto als de ingelogde gebruiker lid is van de groep
 * waar de auto bij hoort. Zet `auto` en `lid` op de context.
 */
export function requireAutoAccess(
  vereisteRol?: 'admin',
): MiddlewareHandler<{ Variables: AutoVariables }> {
  return async (c, next) => {
    const user = c.get('user');
    const autoId = c.req.param('id');
    if (!autoId || !UUID_RE.test(autoId)) throw errors.badRequest('Ongeldig auto-id');

    const rows = await db
      .select({ auto: autos, lid: groepLeden })
      .from(autos)
      .innerJoin(groepLeden, eq(groepLeden.groepId, autos.groepId))
      .where(and(eq(autos.id, autoId), eq(groepLeden.userId, user.id), isNull(autos.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) throw errors.notFound('Auto niet gevonden');
    if (vereisteRol && row.lid.rol !== vereisteRol) {
      throw errors.forbidden('Alleen admins mogen dit doen');
    }

    c.set('auto', row.auto);
    c.set('lid', row.lid);
    await next();
  };
}
