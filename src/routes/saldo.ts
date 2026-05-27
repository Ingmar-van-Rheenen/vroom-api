import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, eq, isNull } from 'drizzle-orm';
import { requireAutoAccess, type AutoVariables } from '../auth/auto.js';
import { requireUser } from '../auth/middleware.js';
import { db } from '../db/client.js';
import { ritten, tankbeurten } from '../db/schema.js';
import { berekenSaldo } from '../lib/saldo.js';

export const saldoRoutes = new OpenAPIHono<{ Variables: AutoVariables }>();

const UserSaldoSchema = z.object({
  userId: z.string().uuid(),
  geredenKm: z.number(),
  verschuldigd: z.number(),
  getanktTotaal: z.number(),
  saldo: z.number(),
});

const SaldoSchema = z.object({
  autoId: z.string().uuid(),
  perUser: z.array(UserSaldoSchema),
  totaal: z.object({
    geredenKm: z.number(),
    verschuldigd: z.number(),
    getanktTotaal: z.number(),
    saldo: z.number(),
  }),
});

const AutoIdParam = z.object({ id: z.string().uuid() });

saldoRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/autos/:id/saldo',
    tags: ['saldo'],
    summary: 'Saldo per gebruiker voor een auto',
    middleware: [requireUser, requireAutoAccess()] as const,
    request: { params: AutoIdParam },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SaldoSchema } } },
    },
  }),
  async (c) => {
    const auto = c.get('auto');
    const [rittenRows, tankRows] = await Promise.all([
      db
        .select({ userId: ritten.userId, km: ritten.km })
        .from(ritten)
        .where(and(eq(ritten.autoId, auto.id), isNull(ritten.deletedAt))),
      db
        .select({ userId: tankbeurten.userId, totaal: tankbeurten.totaal })
        .from(tankbeurten)
        .where(and(eq(tankbeurten.autoId, auto.id), isNull(tankbeurten.deletedAt))),
    ]);

    return c.json(berekenSaldo(auto, rittenRows, tankRows), 200);
  },
);
