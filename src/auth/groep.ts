import { and, eq, isNull } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db } from '../db/client.js';
import { groepLeden, groepen, type Groep, type GroepLid } from '../db/schema.js';
import { errors } from '../lib/errors.js';
import type { AuthVariables } from './middleware.js';

export type GroepVariables = AuthVariables & {
  groep: Groep;
  lid: GroepLid;
};

export function requireGroepMember(
  vereisteRol?: 'admin',
): MiddlewareHandler<{ Variables: GroepVariables }> {
  return async (c, next) => {
    const user = c.get('user');
    const groepId = c.req.param('id');
    if (!groepId) throw errors.badRequest('groep id ontbreekt');

    const rows = await db
      .select({ groep: groepen, lid: groepLeden })
      .from(groepen)
      .innerJoin(groepLeden, eq(groepLeden.groepId, groepen.id))
      .where(and(eq(groepen.id, groepId), eq(groepLeden.userId, user.id), isNull(groepen.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) throw errors.notFound('Groep niet gevonden');
    if (vereisteRol && row.lid.rol !== vereisteRol) {
      throw errors.forbidden('Alleen admins mogen dit doen');
    }

    c.set('groep', row.groep);
    c.set('lid', row.lid);
    await next();
  };
}
