import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { requireAutoAccess } from '../auth/auto.js';
import { requireGroepMember } from '../auth/groep.js';
import { requireUser, type AuthVariables } from '../auth/middleware.js';
import { db } from '../db/client.js';
import { autos, type Auto, type Groep, type GroepLid } from '../db/schema.js';
import { errors } from '../lib/errors.js';

type Vars = AuthVariables & Partial<{ groep: Groep; auto: Auto; lid: GroepLid }>;

export const autosRoutes = new OpenAPIHono<{ Variables: Vars }>();

const AutoSchema = z.object({
  id: z.string().uuid(),
  groepId: z.string().uuid(),
  naam: z.string(),
  merk: z.string().nullable(),
  kenteken: z.string().nullable(),
  kmPerLiter: z.number(),
  prijsPerLiter: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CreateAuto = z.object({
  naam: z.string().min(1).max(80),
  merk: z.string().max(80).optional(),
  kenteken: z.string().max(16).optional(),
  kmPerLiter: z.number().positive(),
  prijsPerLiter: z.number().positive(),
});

const UpdateAuto = z.object({
  naam: z.string().min(1).max(80).optional(),
  merk: z.string().max(80).nullable().optional(),
  kenteken: z.string().max(16).nullable().optional(),
  kmPerLiter: z.number().positive().optional(),
  prijsPerLiter: z.number().positive().optional(),
});

const GroepIdParam = z.object({ id: z.string().uuid() });
const AutoIdParam = z.object({ id: z.string().uuid() });

function serializeAuto(a: Auto) {
  return {
    id: a.id,
    groepId: a.groepId,
    naam: a.naam,
    merk: a.merk,
    kenteken: a.kenteken,
    kmPerLiter: a.kmPerLiter,
    prijsPerLiter: a.prijsPerLiter,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

autosRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/groepen/:id/autos',
    tags: ['autos'],
    summary: 'Voeg een auto toe aan een groep',
    middleware: [requireUser, requireGroepMember()] as const,
    request: {
      params: GroepIdParam,
      body: { content: { 'application/json': { schema: CreateAuto } } },
    },
    responses: {
      201: { description: 'Aangemaakt', content: { 'application/json': { schema: AutoSchema } } },
    },
  }),
  async (c) => {
    const groep = c.get('groep')!;
    const body = c.req.valid('json');
    const inserted = await db
      .insert(autos)
      .values({
        groepId: groep.id,
        naam: body.naam,
        merk: body.merk ?? null,
        kenteken: body.kenteken ?? null,
        kmPerLiter: body.kmPerLiter,
        prijsPerLiter: body.prijsPerLiter,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw errors.badRequest('Kon auto niet aanmaken');
    return c.json(serializeAuto(row), 201);
  },
);

autosRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/groepen/:id/autos',
    tags: ['autos'],
    summary: 'Lijst van autos in een groep',
    middleware: [requireUser, requireGroepMember()] as const,
    request: { params: GroepIdParam },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.array(AutoSchema) } } },
    },
  }),
  async (c) => {
    const groep = c.get('groep')!;
    const rows = await db
      .select()
      .from(autos)
      .where(and(eq(autos.groepId, groep.id), isNull(autos.deletedAt)))
      .orderBy(desc(autos.createdAt));
    return c.json(rows.map(serializeAuto), 200);
  },
);

autosRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/autos/:id',
    tags: ['autos'],
    summary: 'Auto-detail',
    middleware: [requireUser, requireAutoAccess()] as const,
    request: { params: AutoIdParam },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: AutoSchema } } },
      404: { description: 'Niet gevonden' },
    },
  }),
  async (c) => {
    return c.json(serializeAuto(c.get('auto')!), 200);
  },
);

autosRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/autos/:id',
    tags: ['autos'],
    summary: 'Wijzig een auto',
    middleware: [requireUser, requireAutoAccess()] as const,
    request: {
      params: AutoIdParam,
      body: { content: { 'application/json': { schema: UpdateAuto } } },
    },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: AutoSchema } } },
    },
  }),
  async (c) => {
    const auto = c.get('auto')!;
    const body = c.req.valid('json');
    if (Object.keys(body).length === 0) throw errors.badRequest('Niks om te wijzigen');

    const updated = await db
      .update(autos)
      .set({
        ...(body.naam !== undefined ? { naam: body.naam } : {}),
        ...(body.merk !== undefined ? { merk: body.merk } : {}),
        ...(body.kenteken !== undefined ? { kenteken: body.kenteken } : {}),
        ...(body.kmPerLiter !== undefined ? { kmPerLiter: body.kmPerLiter } : {}),
        ...(body.prijsPerLiter !== undefined ? { prijsPerLiter: body.prijsPerLiter } : {}),
        updatedAt: new Date(),
      })
      .where(eq(autos.id, auto.id))
      .returning();
    const row = updated[0];
    if (!row) throw errors.notFound('Auto verdween onderweg');
    return c.json(serializeAuto(row), 200);
  },
);

autosRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/autos/:id',
    tags: ['autos'],
    summary: 'Verwijder een auto (soft-delete)',
    middleware: [requireUser, requireAutoAccess()] as const,
    request: { params: AutoIdParam },
    responses: {
      200: {
        description: 'Verwijderd',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
    },
  }),
  async (c) => {
    const auto = c.get('auto')!;
    await db
      .update(autos)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(autos.id, auto.id));
    return c.json({ ok: true as const }, 200);
  },
);
