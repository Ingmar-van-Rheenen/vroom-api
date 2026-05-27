import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { requireAutoAccess, type AutoVariables } from '../auth/auto.js';
import { requireUser } from '../auth/middleware.js';
import { db } from '../db/client.js';
import { ritten, type Rit } from '../db/schema.js';
import { errors } from '../lib/errors.js';

export const rittenRoutes = new OpenAPIHono<{ Variables: AutoVariables }>();

const Coord = z.object({ lat: z.number(), lng: z.number() });

const RitSchema = z.object({
  id: z.string().uuid(),
  autoId: z.string().uuid(),
  userId: z.string().uuid(),
  datum: z.string(),
  start: Coord.nullable(),
  eind: Coord.nullable(),
  km: z.number(),
  gpsTrack: z.array(Coord).nullable(),
  createdAt: z.string(),
});

const CreateRit = z.object({
  datum: z.string().datetime().optional(),
  start: Coord.optional(),
  eind: Coord.optional(),
  km: z.number().nonnegative(),
  gpsTrack: z.array(Coord).optional(),
});

const AutoIdParam = z.object({ id: z.string().uuid() });
const RitParam = z.object({ id: z.string().uuid(), ritId: z.string().uuid() });

function serializeRit(r: Rit) {
  return {
    id: r.id,
    autoId: r.autoId,
    userId: r.userId,
    datum: r.datum.toISOString(),
    start: r.startLat !== null && r.startLng !== null ? { lat: r.startLat, lng: r.startLng } : null,
    eind: r.eindLat !== null && r.eindLng !== null ? { lat: r.eindLat, lng: r.eindLng } : null,
    km: r.km,
    gpsTrack: (r.gpsTrack as { lat: number; lng: number }[] | null) ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

rittenRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/autos/:id/ritten',
    tags: ['ritten'],
    summary: 'Ritten van een auto',
    middleware: [requireUser, requireAutoAccess()] as const,
    request: { params: AutoIdParam },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.array(RitSchema) } } },
    },
  }),
  async (c) => {
    const auto = c.get('auto');
    const rows = await db
      .select()
      .from(ritten)
      .where(and(eq(ritten.autoId, auto.id), isNull(ritten.deletedAt)))
      .orderBy(desc(ritten.datum));
    return c.json(rows.map(serializeRit), 200);
  },
);

rittenRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/autos/:id/ritten',
    tags: ['ritten'],
    summary: 'Registreer een rit',
    middleware: [requireUser, requireAutoAccess()] as const,
    request: {
      params: AutoIdParam,
      body: { content: { 'application/json': { schema: CreateRit } } },
    },
    responses: {
      201: { description: 'Aangemaakt', content: { 'application/json': { schema: RitSchema } } },
    },
  }),
  async (c) => {
    const auto = c.get('auto');
    const user = c.get('user');
    const body = c.req.valid('json');
    const inserted = await db
      .insert(ritten)
      .values({
        autoId: auto.id,
        userId: user.id,
        datum: body.datum ? new Date(body.datum) : new Date(),
        startLat: body.start?.lat ?? null,
        startLng: body.start?.lng ?? null,
        eindLat: body.eind?.lat ?? null,
        eindLng: body.eind?.lng ?? null,
        km: body.km,
        gpsTrack: body.gpsTrack ?? null,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw errors.badRequest('Kon rit niet opslaan');
    return c.json(serializeRit(row), 201);
  },
);

rittenRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/autos/:id/ritten/:ritId',
    tags: ['ritten'],
    summary: 'Verwijder een rit (soft-delete)',
    middleware: [requireUser, requireAutoAccess()] as const,
    request: { params: RitParam },
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
    const { ritId } = c.req.valid('param');
    const rows = await db
      .select({ id: ritten.id })
      .from(ritten)
      .where(and(eq(ritten.id, ritId), eq(ritten.autoId, auto.id), isNull(ritten.deletedAt)))
      .limit(1);
    if (!rows[0]) throw errors.notFound('Rit niet gevonden');

    await db
      .update(ritten)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(ritten.id, ritId));
    return c.json({ ok: true as const }, 200);
  },
);
