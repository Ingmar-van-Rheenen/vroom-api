import { app } from '../src/app.js';
import { createSession } from '../src/auth/sessions.js';
import { db } from '../src/db/client.js';
import { users, type User } from '../src/db/schema.js';
import { env } from '../src/env.js';

export async function createUser(email: string, naam?: string): Promise<User> {
  const inserted = await db
    .insert(users)
    .values({ email: email.toLowerCase(), naam: naam ?? email.split('@')[0]! })
    .returning();
  return inserted[0]!;
}

/** Maakt een sessie aan en geeft de Cookie-header-waarde terug. */
export async function loginAs(user: User): Promise<string> {
  const { token } = await createSession({ userId: user.id });
  return `${env.SESSION_COOKIE_NAME}=${token}`;
}

export interface ReqInit {
  method?: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
}

/** Dunne wrapper rond app.request met JSON-body en cookie-ondersteuning. */
export async function req(path: string, init: ReqInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...init.headers };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.cookie) headers['Cookie'] = init.cookie;

  return app.request(path, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

export async function jsonOf<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
