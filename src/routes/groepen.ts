import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { groepen, groepLeden, users } from '../db/schema.js';
import { requireUser } from '../auth/middleware.js';
import { requireGroepMember, type GroepVariables } from '../auth/groep.js';
import { errors } from '../lib/errors.js';

export const groepenRoutes = new OpenAPIHono<{ Variables: GroepVariables }>();

const GroepTypeSchema = z.enum(['solo', 'stel', 'familie', 'anders']);
const GroepRolSchema = z.enum(['admin', 'lid']);

const GroepSchema = z.object({
  id: z.string().uuid(),
  naam: z.string(),
  type: GroepTypeSchema,
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const LidSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  naam: z.string(),
  rol: GroepRolSchema,
  joinedAt: z.string(),
});

const GroepDetailSchema = GroepSchema.extend({
  leden: z.array(LidSchema),
});

const CreateGroepSchema = z.object({
  naam: z.string().min(1).max(80),
  type: GroepTypeSchema.default('solo'),
});

const UpdateGroepSchema = z.object({
  naam: z.string().min(1).max(80).optional(),
  type: GroepTypeSchema.optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

groepenRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/groepen',
    tags: ['groepen'],
    summary: 'Maak een nieuwe groep aan',
    middleware: [requireUser] as const,
    request: { body: { content: { 'application/json': { schema: CreateGroepSchema } } } },
    responses: {
      201: {
        description: 'Aangemaakt',
        content: { 'application/json': { schema: GroepSchema } },
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const groep = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(groepen)
        .values({ naam: body.naam, type: body.type, createdBy: user.id })
        .returning();
      const groepRow = inserted[0];
      if (!groepRow) throw errors.badRequest('Kon groep niet aanmaken');

      await tx.insert(groepLeden).values({ groepId: groepRow.id, userId: user.id, rol: 'admin' });

      return groepRow;
    });

    return c.json(serializeGroep(groep), 201);
  },
);

groepenRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/groepen',
    tags: ['groepen'],
    summary: 'Lijst van groepen waar ik in zit',
    middleware: [requireUser] as const,
    responses: {
      200: {
        description: 'OK',
        content: {
          'application/json': { schema: z.array(GroepSchema.extend({ rol: GroepRolSchema })) },
        },
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const rows = await db
      .select({ groep: groepen, rol: groepLeden.rol })
      .from(groepen)
      .innerJoin(groepLeden, eq(groepLeden.groepId, groepen.id))
      .where(and(eq(groepLeden.userId, user.id), isNull(groepen.deletedAt)))
      .orderBy(desc(groepen.createdAt));

    return c.json(
      rows.map((r) => ({ ...serializeGroep(r.groep), rol: r.rol })),
      200,
    );
  },
);

groepenRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/groepen/:id',
    tags: ['groepen'],
    summary: 'Groep-detail met leden',
    middleware: [requireUser, requireGroepMember()] as const,
    request: { params: IdParam },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: GroepDetailSchema } } },
      404: { description: 'Niet gevonden' },
    },
  }),
  async (c) => {
    const groep = c.get('groep');
    const leden = await db
      .select({
        userId: users.id,
        email: users.email,
        naam: users.naam,
        rol: groepLeden.rol,
        joinedAt: groepLeden.joinedAt,
      })
      .from(groepLeden)
      .innerJoin(users, eq(users.id, groepLeden.userId))
      .where(eq(groepLeden.groepId, groep.id));

    return c.json(
      {
        ...serializeGroep(groep),
        leden: leden.map((l) => ({
          userId: l.userId,
          email: l.email,
          naam: l.naam,
          rol: l.rol,
          joinedAt: l.joinedAt.toISOString(),
        })),
      },
      200,
    );
  },
);

groepenRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/groepen/:id',
    tags: ['groepen'],
    summary: 'Wijzig naam of type (admin)',
    middleware: [requireUser, requireGroepMember('admin')] as const,
    request: {
      params: IdParam,
      body: { content: { 'application/json': { schema: UpdateGroepSchema } } },
    },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: GroepSchema } } },
    },
  }),
  async (c) => {
    const groep = c.get('groep');
    const body = c.req.valid('json');
    if (!body.naam && !body.type) throw errors.badRequest('Niks om te wijzigen');

    const updated = await db
      .update(groepen)
      .set({
        ...(body.naam ? { naam: body.naam } : {}),
        ...(body.type ? { type: body.type } : {}),
        updatedAt: new Date(),
      })
      .where(eq(groepen.id, groep.id))
      .returning();

    const row = updated[0];
    if (!row) throw errors.notFound('Groep verdween onderweg');
    return c.json(serializeGroep(row), 200);
  },
);

groepenRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/groepen/:id/leave',
    tags: ['groepen'],
    summary: 'Verlaat de groep',
    middleware: [requireUser, requireGroepMember()] as const,
    request: { params: IdParam },
    responses: {
      200: {
        description: 'Vertrokken',
        content: {
          'application/json': {
            schema: z.object({ ok: z.literal(true), groepGesloten: z.boolean() }),
          },
        },
      },
      409: { description: 'Laatste admin' },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const groep = c.get('groep');
    const lid = c.get('lid');

    const result = await db.transaction(async (tx) => {
      const alleLeden = await tx
        .select({ userId: groepLeden.userId, rol: groepLeden.rol })
        .from(groepLeden)
        .where(eq(groepLeden.groepId, groep.id));

      if (lid.rol === 'admin') {
        const overigeAdmins = alleLeden.filter((l) => l.userId !== user.id && l.rol === 'admin');
        if (overigeAdmins.length === 0 && alleLeden.length > 1) {
          throw errors.conflict('Maak eerst iemand anders admin voor je vertrekt');
        }
      }

      await tx
        .delete(groepLeden)
        .where(and(eq(groepLeden.groepId, groep.id), eq(groepLeden.userId, user.id)));

      const wasLast = alleLeden.length === 1;
      if (wasLast) {
        await tx
          .update(groepen)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(groepen.id, groep.id));
      }
      return { groepGesloten: wasLast };
    });

    return c.json({ ok: true as const, ...result }, 200);
  },
);

const KickParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

groepenRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/groepen/:id/leden/:userId',
    tags: ['groepen'],
    summary: 'Verwijder een lid uit de groep (admin)',
    middleware: [requireUser, requireGroepMember('admin')] as const,
    request: { params: KickParam },
    responses: {
      200: {
        description: 'Verwijderd',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
    },
  }),
  async (c) => {
    const huidigeUser = c.get('user');
    const groep = c.get('groep');
    const { userId } = c.req.valid('param');

    if (userId === huidigeUser.id) {
      throw errors.badRequest('Gebruik /leave om jezelf te verwijderen');
    }

    const target = await db
      .select()
      .from(groepLeden)
      .where(and(eq(groepLeden.groepId, groep.id), eq(groepLeden.userId, userId)))
      .limit(1);

    if (!target[0]) throw errors.notFound('Lid niet gevonden');

    await db
      .delete(groepLeden)
      .where(and(eq(groepLeden.groepId, groep.id), eq(groepLeden.userId, userId)));

    return c.json({ ok: true as const }, 200);
  },
);

function serializeGroep(g: typeof groepen.$inferSelect) {
  return {
    id: g.id,
    naam: g.naam,
    type: g.type,
    createdBy: g.createdBy,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}
