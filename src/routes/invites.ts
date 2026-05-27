import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { groepInvites, groepLeden, groepen, users } from '../db/schema.js';
import { requireUser, type AuthVariables } from '../auth/middleware.js';
import { requireGroepMember, type GroepVariables } from '../auth/groep.js';
import { AppError, errors } from '../lib/errors.js';
import { generateToken } from '../lib/tokens.js';

const INVITE_TTL_DAYS = 7;

export const inviteRoutes = new OpenAPIHono<{
  Variables: AuthVariables & Partial<GroepVariables>;
}>();

const InvitePreview = z.object({
  code: z.string(),
  groep: z.object({
    id: z.string().uuid(),
    naam: z.string(),
    type: z.enum(['solo', 'stel', 'familie', 'anders']),
  }),
  email: z.string().email().nullable(),
  uitnodigerNaam: z.string(),
  expiresAt: z.string(),
});

const CreateInvite = z.object({
  email: z.string().email().optional(),
});

const CreatedInvite = z.object({
  code: z.string(),
  email: z.string().email().nullable(),
  expiresAt: z.string(),
  url: z.string().url(),
});

const CodeParam = z.object({ code: z.string().min(1).max(64) });
const IdParam = z.object({ id: z.string().uuid() });

inviteRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/groepen/:id/invites',
    tags: ['invites'],
    summary: 'Maak een uitnodiging voor deze groep (admin)',
    middleware: [requireUser, requireGroepMember('admin')] as const,
    request: {
      params: IdParam,
      body: { content: { 'application/json': { schema: CreateInvite } } },
    },
    responses: {
      201: {
        description: 'Aangemaakt',
        content: { 'application/json': { schema: CreatedInvite } },
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const groep = c.get('groep')!;
    const body = c.req.valid('json');
    const code = generateToken(16);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const inserted = await db
      .insert(groepInvites)
      .values({
        groepId: groep.id,
        code,
        email: body.email?.toLowerCase() ?? null,
        createdBy: user.id,
        expiresAt,
      })
      .returning();

    const row = inserted[0];
    if (!row) throw errors.badRequest('Kon invite niet aanmaken');

    return c.json(
      {
        code: row.code,
        email: row.email,
        expiresAt: row.expiresAt.toISOString(),
        url: `/invites/${row.code}`,
      },
      201,
    );
  },
);

inviteRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/invites/:code',
    tags: ['invites'],
    summary: 'Preview van een uitnodiging (geen login nodig)',
    request: { params: CodeParam },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: InvitePreview } } },
      410: { description: 'Verlopen of al gebruikt' },
      404: { description: 'Onbekende code' },
    },
  }),
  async (c) => {
    const { code } = c.req.valid('param');
    const rows = await db
      .select({
        invite: groepInvites,
        groep: groepen,
        uitnodigerNaam: users.naam,
      })
      .from(groepInvites)
      .innerJoin(groepen, eq(groepen.id, groepInvites.groepId))
      .innerJoin(users, eq(users.id, groepInvites.createdBy))
      .where(eq(groepInvites.code, code))
      .limit(1);

    const row = rows[0];
    if (!row) throw errors.notFound('Onbekende uitnodiging');
    if (row.invite.acceptedAt) throw new AppError(410, 'invite_used', 'Uitnodiging is al gebruikt');
    if (row.invite.expiresAt < new Date())
      throw new AppError(410, 'invite_expired', 'Uitnodiging is verlopen');

    return c.json(
      {
        code: row.invite.code,
        groep: { id: row.groep.id, naam: row.groep.naam, type: row.groep.type },
        email: row.invite.email,
        uitnodigerNaam: row.uitnodigerNaam,
        expiresAt: row.invite.expiresAt.toISOString(),
      },
      200,
    );
  },
);

inviteRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/invites/:code/accept',
    tags: ['invites'],
    summary: 'Accepteer een uitnodiging',
    middleware: [requireUser] as const,
    request: { params: CodeParam },
    responses: {
      200: {
        description: 'Geaccepteerd',
        content: {
          'application/json': {
            schema: z.object({ groepId: z.string().uuid() }),
          },
        },
      },
      403: { description: 'Email matcht niet' },
      409: { description: 'Al lid' },
      410: { description: 'Verlopen of al gebruikt' },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const { code } = c.req.valid('param');

    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(groepInvites)
        .where(
          and(
            eq(groepInvites.code, code),
            gt(groepInvites.expiresAt, new Date()),
            isNull(groepInvites.acceptedAt),
          ),
        )
        .limit(1);

      const invite = rows[0];
      if (!invite) throw errors.notFound('Uitnodiging ongeldig, verlopen of al gebruikt');

      if (invite.email && invite.email !== user.email.toLowerCase()) {
        throw errors.forbidden('Deze uitnodiging is voor een ander e-mailadres');
      }

      const bestaand = await tx
        .select()
        .from(groepLeden)
        .where(and(eq(groepLeden.groepId, invite.groepId), eq(groepLeden.userId, user.id)))
        .limit(1);

      if (bestaand[0]) throw errors.conflict('Je zit al in deze groep');

      await tx.insert(groepLeden).values({
        groepId: invite.groepId,
        userId: user.id,
        rol: 'lid',
      });

      await tx
        .update(groepInvites)
        .set({ acceptedAt: new Date(), acceptedBy: user.id })
        .where(eq(groepInvites.id, invite.id));

      return { groepId: invite.groepId };
    });

    return c.json(result, 200);
  },
);

inviteRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/groepen/:id/invites',
    tags: ['invites'],
    summary: 'Lijst openstaande uitnodigingen voor deze groep (admin)',
    middleware: [requireUser, requireGroepMember('admin')] as const,
    request: { params: IdParam },
    responses: {
      200: {
        description: 'OK',
        content: {
          'application/json': {
            schema: z.array(
              z.object({
                id: z.string().uuid(),
                code: z.string(),
                email: z.string().email().nullable(),
                createdBy: z.string().uuid(),
                expiresAt: z.string(),
                createdAt: z.string(),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const groep = c.get('groep')!;
    const rows = await db
      .select()
      .from(groepInvites)
      .where(
        and(
          eq(groepInvites.groepId, groep.id),
          isNull(groepInvites.acceptedAt),
          gt(groepInvites.expiresAt, new Date()),
        ),
      );

    return c.json(
      rows.map((r) => ({
        id: r.id,
        code: r.code,
        email: r.email,
        createdBy: r.createdBy,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      200,
    );
  },
);

inviteRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/groepen/:id/invites/:code',
    tags: ['invites'],
    summary: 'Trek een openstaande uitnodiging in (admin)',
    middleware: [requireUser, requireGroepMember('admin')] as const,
    request: { params: IdParam.merge(CodeParam) },
    responses: {
      200: {
        description: 'Ingetrokken',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
    },
  }),
  async (c) => {
    const groep = c.get('groep')!;
    const { code } = c.req.valid('param');
    await db
      .delete(groepInvites)
      .where(
        and(
          eq(groepInvites.groepId, groep.id),
          eq(groepInvites.code, code),
          isNull(groepInvites.acceptedAt),
        ),
      );
    return c.json({ ok: true as const }, 200);
  },
);
