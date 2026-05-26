import { eq, lt } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { db } from '../db/client.js';
import { sessions, users, type User } from '../db/schema.js';
import { env } from '../env.js';
import { generateToken, hashToken } from '../lib/tokens.js';

export interface SessionWithUser {
  sessionId: string;
  user: User;
}

export async function createSession(opts: {
  userId: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId: opts.userId,
    tokenHash,
    expiresAt,
    userAgent: opts.userAgent ?? null,
    ipAddress: opts.ipAddress ?? null,
  });

  return { token, expiresAt };
}

export async function getSessionByToken(token: string): Promise<SessionWithUser | null> {
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }

  await db
    .update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessions.id, row.session.id));

  return { sessionId: row.session.id, user: row.user };
}

export async function deleteSessionByToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
  setCookie(c, env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.SESSION_COOKIE_SECURE,
    sameSite: 'Lax',
    path: '/',
    domain: env.SESSION_COOKIE_DOMAIN,
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, env.SESSION_COOKIE_NAME, {
    path: '/',
    domain: env.SESSION_COOKIE_DOMAIN,
  });
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, env.SESSION_COOKIE_NAME);
}
