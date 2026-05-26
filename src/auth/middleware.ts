import type { Context, MiddlewareHandler } from 'hono';
import type { User } from '../db/schema.js';
import { errors } from '../lib/errors.js';
import { getSessionByToken, readSessionCookie } from './sessions.js';

export type AuthVariables = {
  user: User;
  sessionId: string;
};

export const requireUser: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const token = readSessionCookie(c);
  if (!token) throw errors.unauthorized();

  const session = await getSessionByToken(token);
  if (!session) throw errors.unauthorized();

  c.set('user', session.user);
  c.set('sessionId', session.sessionId);
  await next();
};

export function getUser(c: Context<{ Variables: AuthVariables }>): User {
  return c.get('user');
}
