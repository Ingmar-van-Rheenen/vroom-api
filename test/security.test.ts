import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { consumeMagicLink, createMagicLink } from '../src/auth/magic-link.js';
import { db } from '../src/db/client.js';
import { magicLinks, sessions, users } from '../src/db/schema.js';
import { hashToken } from '../src/lib/tokens.js';
import { createUser, jsonOf, loginAs, req } from './helpers.js';

async function maakGroep(cookie: string) {
  return jsonOf<{ id: string }>(
    await req('/groepen', { method: 'POST', cookie, body: { naam: 'Sec', type: 'familie' } }),
  );
}

describe('security: authenticatie verplicht', () => {
  const beschermd: [string, string][] = [
    ['GET', '/me'],
    ['GET', '/groepen'],
    ['POST', '/groepen'],
  ];

  for (const [method, path] of beschermd) {
    it(`${method} ${path} geeft 401 zonder cookie`, async () => {
      const res = await req(path, { method, ...(method === 'POST' ? { body: {} } : {}) });
      expect(res.status).toBe(401);
    });
  }
});

describe('security: cross-tenant toegang (IDOR/BOLA)', () => {
  it('user B kan groep van user A niet lezen, wijzigen of uitnodigen', async () => {
    const a = await createUser('idor-a@vroom.test');
    const b = await createUser('idor-b@vroom.test');
    const ca = await loginAs(a);
    const cb = await loginAs(b);
    const groep = await maakGroep(ca);

    expect((await req(`/groepen/${groep.id}`, { cookie: cb })).status).toBe(404);
    expect(
      (await req(`/groepen/${groep.id}`, { method: 'PATCH', cookie: cb, body: { naam: 'hack' } }))
        .status,
    ).toBe(404);
    expect(
      (await req(`/groepen/${groep.id}/invites`, { method: 'POST', cookie: cb, body: {} })).status,
    ).toBe(404);
  });
});

describe('security: rol-escalatie', () => {
  it('een gewoon lid kan geen admin-acties uitvoeren', async () => {
    const admin = await createUser('role-admin@vroom.test');
    const lid = await createUser('role-lid@vroom.test');
    const ca = await loginAs(admin);
    const cl = await loginAs(lid);
    const groep = await maakGroep(ca);

    // lid via open invite binnenhalen
    const inv = await jsonOf<{ code: string }>(
      await req(`/groepen/${groep.id}/invites`, { method: 'POST', cookie: ca, body: {} }),
    );
    await req(`/invites/${inv.code}/accept`, { method: 'POST', cookie: cl });

    expect(
      (await req(`/groepen/${groep.id}`, { method: 'PATCH', cookie: cl, body: { naam: 'x' } }))
        .status,
    ).toBe(403);
    expect(
      (await req(`/groepen/${groep.id}/invites`, { method: 'POST', cookie: cl, body: {} })).status,
    ).toBe(403);
    expect(
      (await req(`/groepen/${groep.id}/leden/${admin.id}`, { method: 'DELETE', cookie: cl }))
        .status,
    ).toBe(403);
  });
});

describe('security: token-opslag', () => {
  it('sessie-tokens staan alleen gehasht in de database', async () => {
    const user = await createUser('hash@vroom.test');
    const cookie = await loginAs(user);
    const token = cookie.split('=')[1]!;

    const byPlaintext = await db.select().from(sessions).where(eq(sessions.tokenHash, token));
    expect(byPlaintext).toHaveLength(0);

    const byHash = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)));
    expect(byHash).toHaveLength(1);
  });

  it('magic-link-tokens staan alleen gehasht in de database', async () => {
    const { token } = await createMagicLink('ml-hash@vroom.test');
    const byPlain = await db.select().from(magicLinks).where(eq(magicLinks.tokenHash, token));
    expect(byPlain).toHaveLength(0);
    const byHash = await db
      .select()
      .from(magicLinks)
      .where(eq(magicLinks.tokenHash, hashToken(token)));
    expect(byHash).toHaveLength(1);
  });
});

describe('security: magic-link levensduur', () => {
  it('een verlopen magic-link kan niet worden ingewisseld', async () => {
    const { token } = await createMagicLink('expired@vroom.test');
    await db
      .update(magicLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(magicLinks.tokenHash, hashToken(token)));
    expect(await consumeMagicLink(token)).toBeNull();
  });
});

describe('security: injection', () => {
  it('uuid-param met SQL-injection wordt geweigerd door validatie (400)', async () => {
    const user = await createUser('inj@vroom.test');
    const cookie = await loginAs(user);
    const res = await req(`/groepen/${encodeURIComponent("' OR 1=1; --")}`, { cookie });
    expect(res.status).toBe(400);
  });

  it('invite-code met injection-payload geeft netjes 404, geen 500', async () => {
    const res = await req(`/invites/${encodeURIComponent("'; DROP TABLE users; --")}`);
    expect([404, 410]).toContain(res.status);
    // gebruikers-tabel bestaat nog
    const stillThere = await db.select().from(users);
    expect(Array.isArray(stillThere)).toBe(true);
  });
});

describe('security: response headers', () => {
  it('zet hardening-headers op responses', async () => {
    const res = await req('/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBeTruthy();
  });
});

describe('security: rate limiting', () => {
  it('blokkeert te veel magic-link-aanvragen met 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await req('/auth/magic-link', {
        method: 'POST',
        body: { email: `rl${i}@vroom.test` },
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses).toContain(429);
  });
});
