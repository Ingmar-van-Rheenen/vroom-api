import { describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { groepLeden } from '../src/db/schema.js';
import { createUser, jsonOf, loginAs, req, type ReqInit } from './helpers.js';

interface Setup {
  cookie: string;
  userId: string;
  groepId: string;
  autoId: string;
}

async function setupAuto(email = 'auto-owner@vroom.test'): Promise<Setup> {
  const user = await createUser(email);
  const cookie = await loginAs(user);
  const groep = await jsonOf<{ id: string }>(
    await req('/groepen', { method: 'POST', cookie, body: { naam: 'G', type: 'familie' } }),
  );
  const auto = await jsonOf<{ id: string }>(
    await req(`/groepen/${groep.id}/autos`, {
      method: 'POST',
      cookie,
      body: { naam: 'Polo', merk: 'Volkswagen', kmPerLiter: 10, prijsPerLiter: 2 },
    }),
  );
  return { cookie, userId: user.id, groepId: groep.id, autoId: auto.id };
}

describe('autos CRUD', () => {
  it('maakt een auto aan en toont hem in de groepslijst', async () => {
    const s = await setupAuto();
    const lijst = await jsonOf<unknown[]>(
      await req(`/groepen/${s.groepId}/autos`, { cookie: s.cookie }),
    );
    expect(lijst).toHaveLength(1);
  });

  it('wijzigt een auto', async () => {
    const s = await setupAuto('patch-auto@vroom.test');
    const res = await req(`/autos/${s.autoId}`, {
      method: 'PATCH',
      cookie: s.cookie,
      body: { prijsPerLiter: 2.5 },
    });
    expect(res.status).toBe(200);
    const body = await jsonOf<{ prijsPerLiter: number }>(res);
    expect(body.prijsPerLiter).toBe(2.5);
  });

  it('soft-delete verbergt de auto', async () => {
    const s = await setupAuto('del-auto@vroom.test');
    expect((await req(`/autos/${s.autoId}`, { method: 'DELETE', cookie: s.cookie })).status).toBe(
      200,
    );
    expect((await req(`/autos/${s.autoId}`, { cookie: s.cookie })).status).toBe(404);
    const lijst = await jsonOf<unknown[]>(
      await req(`/groepen/${s.groepId}/autos`, { cookie: s.cookie }),
    );
    expect(lijst).toHaveLength(0);
  });
});

describe('ritten', () => {
  it('registreert en verwijdert een rit', async () => {
    const s = await setupAuto('rit@vroom.test');
    const rit = await jsonOf<{ id: string; km: number }>(
      await req(`/autos/${s.autoId}/ritten`, {
        method: 'POST',
        cookie: s.cookie,
        body: { km: 42.5 },
      }),
    );
    expect(rit.km).toBe(42.5);

    const lijst = await jsonOf<unknown[]>(
      await req(`/autos/${s.autoId}/ritten`, { cookie: s.cookie }),
    );
    expect(lijst).toHaveLength(1);

    expect(
      (await req(`/autos/${s.autoId}/ritten/${rit.id}`, { method: 'DELETE', cookie: s.cookie }))
        .status,
    ).toBe(200);
    expect(
      await jsonOf<unknown[]>(await req(`/autos/${s.autoId}/ritten`, { cookie: s.cookie })),
    ).toHaveLength(0);
  });
});

describe('tankbeurten', () => {
  it('berekent totaal als die niet wordt meegegeven', async () => {
    const s = await setupAuto('tank@vroom.test');
    const t = await jsonOf<{ totaal: number }>(
      await req(`/autos/${s.autoId}/tankbeurten`, {
        method: 'POST',
        cookie: s.cookie,
        body: { liters: 20, prijsPerLiter: 2 },
      }),
    );
    expect(t.totaal).toBe(40);
  });
});

describe('saldo', () => {
  it('berekent saldo per gebruiker via de API', async () => {
    const s = await setupAuto('saldo@vroom.test');
    // tweede gebruiker handmatig aan de groep toevoegen
    const partner = await createUser('saldo-partner@vroom.test');
    await db.insert(groepLeden).values({ groepId: s.groepId, userId: partner.id, rol: 'lid' });
    const pcookie = await loginAs(partner);

    // owner rijdt 100 km, tankt 30 euro; partner rijdt 50 km, tankt niets
    await req(`/autos/${s.autoId}/ritten`, { method: 'POST', cookie: s.cookie, body: { km: 100 } });
    await req(`/autos/${s.autoId}/tankbeurten`, {
      method: 'POST',
      cookie: s.cookie,
      body: { liters: 15, prijsPerLiter: 2, totaal: 30 },
    });
    await req(`/autos/${s.autoId}/ritten`, { method: 'POST', cookie: pcookie, body: { km: 50 } });

    const saldo = await jsonOf<{
      perUser: { userId: string; verschuldigd: number; saldo: number }[];
      totaal: { saldo: number };
    }>(await req(`/autos/${s.autoId}/saldo`, { cookie: s.cookie }));

    const owner = saldo.perUser.find((u) => u.userId === s.userId)!;
    const part = saldo.perUser.find((u) => u.userId === partner.id)!;
    expect(owner.saldo).toBe(10); // 30 getankt - 20 verschuldigd
    expect(part.saldo).toBe(-10); // 0 getankt - 10 verschuldigd
    expect(saldo.totaal.saldo).toBe(0);
  });
});

describe('security: autos cross-tenant', () => {
  it('een buitenstaander heeft geen toegang tot andermans auto of ritten', async () => {
    const s = await setupAuto('sec-owner@vroom.test');
    const outsider = await createUser('sec-outsider@vroom.test');
    const oc = await loginAs(outsider);

    const cases: [string, ReqInit][] = [
      [`/autos/${s.autoId}`, { cookie: oc }],
      [`/autos/${s.autoId}`, { method: 'PATCH', cookie: oc, body: { naam: 'hack' } }],
      [`/autos/${s.autoId}`, { method: 'DELETE', cookie: oc }],
      [`/groepen/${s.groepId}/autos`, { cookie: oc }],
      [`/autos/${s.autoId}/ritten`, { cookie: oc }],
      [`/autos/${s.autoId}/ritten`, { method: 'POST', cookie: oc, body: { km: 10 } }],
      [
        `/autos/${s.autoId}/tankbeurten`,
        { method: 'POST', cookie: oc, body: { liters: 1, prijsPerLiter: 2 } },
      ],
      [`/autos/${s.autoId}/saldo`, { cookie: oc }],
    ];

    for (const [path, init] of cases) {
      const res = await req(path, init);
      expect(res.status, `${init.method ?? 'GET'} ${path}`).toBe(404);
    }
  });

  it('vereist authenticatie op auto-endpoints', async () => {
    const s = await setupAuto('sec-auth@vroom.test');
    expect((await req(`/autos/${s.autoId}`)).status).toBe(401);
    expect((await req(`/autos/${s.autoId}/saldo`)).status).toBe(401);
  });
});
