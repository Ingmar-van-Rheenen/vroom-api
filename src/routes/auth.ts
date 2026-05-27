import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import {
  clearSessionCookie,
  createSession,
  deleteSessionByToken,
  readSessionCookie,
  setSessionCookie,
} from '../auth/sessions.js';
import { consumeMagicLink, createMagicLink, sendMagicLinkEmail } from '../auth/magic-link.js';
import { env } from '../env.js';
import { errors } from '../lib/errors.js';
import { rateLimit } from '../lib/rate-limit.js';

export const authRoutes = new OpenAPIHono();

const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'magic-link',
});

const MagicLinkRequest = z.object({
  email: z.string().email().max(254),
});

const MagicLinkResponse = z.object({
  ok: z.literal(true),
  message: z.string(),
});

authRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/auth/magic-link',
    tags: ['auth'],
    summary: 'Vraag een inlog-link aan',
    middleware: [magicLinkLimiter] as const,
    request: {
      body: { content: { 'application/json': { schema: MagicLinkRequest } } },
    },
    responses: {
      200: {
        description: 'Link verzonden (of gelogd in dev-mode)',
        content: { 'application/json': { schema: MagicLinkResponse } },
      },
    },
  }),
  async (c) => {
    const { email } = c.req.valid('json');
    const { token } = await createMagicLink(email);
    await sendMagicLinkEmail({ email, token });

    return c.json(
      {
        ok: true as const,
        message: `Als ${email} bekend is, krijg je een inlog-link in je mailbox.`,
      },
      200,
    );
  },
);

authRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/auth/callback',
    tags: ['auth'],
    summary: 'Wissel magic-link in voor sessie',
    request: {
      query: z.object({ token: z.string().min(1) }),
    },
    responses: {
      302: { description: 'Redirect naar APP_URL' },
      400: { description: 'Ongeldige of verlopen token' },
    },
  }),
  async (c) => {
    const { token } = c.req.valid('query');
    const consumed = await consumeMagicLink(token);
    if (!consumed) throw errors.badRequest('Link is ongeldig of verlopen');

    const existing = await db.select().from(users).where(eq(users.email, consumed.email)).limit(1);

    let userId: string;
    if (existing[0]) {
      userId = existing[0].id;
    } else {
      const inserted = await db
        .insert(users)
        .values({ email: consumed.email, naam: consumed.email.split('@')[0] ?? 'Gebruiker' })
        .returning({ id: users.id });
      const row = inserted[0];
      if (!row) throw errors.badRequest('Kon gebruiker niet aanmaken');
      userId = row.id;
    }

    const userAgent = c.req.header('user-agent') ?? undefined;
    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    const { token: sessionToken, expiresAt } = await createSession({
      userId,
      userAgent,
      ipAddress,
    });
    setSessionCookie(c, sessionToken, expiresAt);

    return c.redirect(env.APP_URL, 302);
  },
);

authRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/auth/logout',
    tags: ['auth'],
    summary: 'Log uit en wis sessie',
    responses: {
      200: {
        description: 'Uitgelogd',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
    },
  }),
  async (c) => {
    const token = readSessionCookie(c);
    if (token) await deleteSessionByToken(token);
    clearSessionCookie(c);
    return c.json({ ok: true as const }, 200);
  },
);
