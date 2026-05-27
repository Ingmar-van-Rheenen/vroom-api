import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { consumeMagicLink, createMagicLink } from '../src/auth/magic-link.js';
import { db } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import { env } from '../src/env.js';
import { createUser, jsonOf, loginAs, req } from './helpers.js';

describe('auth', () => {
  it('POST /auth/magic-link geeft altijd een neutrale 200', async () => {
    const res = await req('/auth/magic-link', {
      method: 'POST',
      body: { email: 'nieuw@vroom.test' },
    });
    expect(res.status).toBe(200);
    const body = await jsonOf<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it('weigert een ongeldig e-mailadres met 400', async () => {
    const res = await req('/auth/magic-link', { method: 'POST', body: { email: 'geen-email' } });
    expect(res.status).toBe(400);
  });

  it('callback maakt een nieuwe gebruiker aan en zet een sessie-cookie', async () => {
    const { token } = await createMagicLink('vers@vroom.test');
    const res = await req(`/auth/callback?token=${token}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(env.APP_URL);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${env.SESSION_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain('httponly');

    const rows = await db.select().from(users).where(eq(users.email, 'vers@vroom.test'));
    expect(rows).toHaveLength(1);
  });

  it('weigert een onbekende of verlopen callback-token', async () => {
    const res = await req('/auth/callback?token=bestaatniet');
    expect(res.status).toBe(400);
  });

  it('GET /me geeft de ingelogde gebruiker terug', async () => {
    const user = await createUser('me@vroom.test', 'Tester');
    const cookie = await loginAs(user);
    const res = await req('/me', { cookie });
    expect(res.status).toBe(200);
    const body = await jsonOf<{ email: string; naam: string }>(res);
    expect(body.email).toBe('me@vroom.test');
    expect(body.naam).toBe('Tester');
  });

  it('GET /me zonder cookie geeft 401', async () => {
    const res = await req('/me');
    expect(res.status).toBe(401);
  });

  it('magic-link is single-use', async () => {
    const { token } = await createMagicLink('once@vroom.test');
    const first = await consumeMagicLink(token);
    const second = await consumeMagicLink(token);
    expect(first?.email).toBe('once@vroom.test');
    expect(second).toBeNull();
  });

  it('logout wist de sessie zodat /me weer 401 geeft', async () => {
    const user = await createUser('logout@vroom.test');
    const cookie = await loginAs(user);
    expect((await req('/me', { cookie })).status).toBe(200);
    const out = await req('/auth/logout', { method: 'POST', cookie });
    expect(out.status).toBe(200);
    expect((await req('/me', { cookie })).status).toBe(401);
  });
});
