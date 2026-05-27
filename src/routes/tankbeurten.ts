import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { requireAutoAccess, type AutoVariables } from '../auth/auto.js';
import { requireUser } from '../auth/middleware.js';
import { db } from '../db/client.js';
import { tankbeurten, type Tankbeurt } from '../db/schema.js';
import { errors } from '../lib/errors.js';

export const tankbeurtenRoutes = new OpenAPIHono<{ Variables: AutoVariables }>();

const TankbeurtSchema = z.object({
  id: z.string().uuid(),
  autoId: z.string().uuid(),
  userId: z.string().uuid(),
  datum: z.string(),
  liters: z.number(),
  prijsPerLiter: z.number(),
  totaal: z.number(),
  createdAt: z.string(),
});

const CreateTankbeurt = z.object({
  datum: z.string().datetime().optional(),
  liters: z.number().positive(),
  prijsPerLiter: z.number().positive(),
  totaal: z.number().positive().optional(),
});

const AutoIdParam = z.object({ id: z.string().uuid() });
const TankParam = z.object({ id: z.string().uuid(), tankId: z.string().uuid() });

function serializeTankbeurt(t: Tankbeurt) {
  return {
    id: t.id,
    autoId: t.autoId,
    userId: t.userId,
    datum: t.datum.toISOString(),
    liters: t.liters,
    prijsPerLiter: t.prijsPerLiter,
    totaal: t.totaal,
    createdAt: t.createdAt.toISOString(),
  };
}

tankbeurtenRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/autos/:id/tankbeurten',
    tags: ['tankbeurten'],
    summary: 'Tankbeurten van een auto',
    middleware: [requireUser, requireAutoAccess()] as const,
    request: { params: AutoIdParam },
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: z.array(TankbeurtSchema) } },
      },
    },
  }),
  async (c) => {
    const auto = c.get('auto');
    const rows = await db
      .select()
      .from(tankbeurten)
      .where(and(eq(tankbeurten.autoId, auto.id), isNull(tankbeurten.deletedAt)))
      .orderBy(desc(tankbeurten.datum));
    return c.json(rows.map(serializeTankbeurt), 200);
  },
);

tankbeurtenRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/autos/:id/tankbeurten',
    tags: ['tankbeurten'],
    summary: 'Registreer een tankbeurt',
    middleware: [requireUser, requireAutoAccess()] as const,
    request: {
      params: AutoIdParam,
      body: { content: { 'application/json': { schema: CreateTankbeurt } } },
    },
    responses: {
      201: {
        description: 'Aangemaakt',
        content: { 'application/json': { schema: TankbeurtSchema } },
      },
    },
  }),
  async (c) => {
    const auto = c.get('auto');
    const user = c.get('user');
    const body = c.req.valid('json');
    const totaal = body.totaal ?? body.liters * body.prijsPerLiter;
    const inserted = await db
      .insert(tankbeurten)
      .values({
        autoId: auto.id,
        userId: user.id,
        datum: body.datum ? new Date(body.datum) : new Date(),
        liters: body.liters,
        prijsPerLiter: body.prijsPerLiter,
        totaal,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw errors.badRequest('Kon tankbeurt niet opslaan');
    return c.json(serializeTankbeurt(row), 201);
  },
);

tankbeurtenRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/autos/:id/tankbeurten/:tankId',
    tags: ['tankbeurten'],
    summary: 'Verwijder een tankbeurt (soft-delete)',
    middleware: [requireUser, requireAutoAccess()] as const,
    request: { params: TankParam },
    responses: {
      200: {
        description: 'Verwijderd',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
      404: { description: 'Niet gevonden' },
    },
  }),
  async (c) => {
    const auto = c.get('auto');
    const { tankId } = c.req.valid('param');
    const rows = await db
      .select({ id: tankbeurten.id })
      .from(tankbeurten)
      .where(
        and(
          eq(tankbeurten.id, tankId),
          eq(tankbeurten.autoId, auto.id),
          isNull(tankbeurten.deletedAt),
        ),
      )
      .limit(1);
    if (!rows[0]) throw errors.notFound('Tankbeurt niet gevonden');

    await db
      .update(tankbeurten)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(tankbeurten.id, tankId));
    return c.json({ ok: true as const }, 200);
  },
);
