import { describe, expect, it } from 'vitest';
import { createUser, jsonOf, loginAs, req } from './helpers.js';

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Setup {
  cookie: string;
  userId: string;
  groepId: string;
  autoId: string;
}

async function setupAuto(email: string): Promise<Setup> {
  const user = await createUser(email);
  const cookie = await loginAs(user);
  const groep = await jsonOf<{ id: string }>(
    await req('/groepen', { method: 'POST', cookie, body: { naam: 'G', type: 'familie' } }),
  );
  const auto = await jsonOf<{ id: string }>(
    await req(`/groepen/${groep.id}/autos`, {
      method: 'POST',
      cookie,
      body: { naam: 'Polo', kmPerLiter: 10, prijsPerLiter: 2 },
    }),
  );
  return { cookie, userId: user.id, groepId: groep.id, autoId: auto.id };
}

interface PullResult {
  serverTime: string;
  groepen: { id: string }[];
  autos: { id: string; deletedAt: string | null }[];
  ritten: { id: string; km: number; deletedAt: string | null }[];
  tankbeurten: { id: string }[];
}

const pull = (cookie: string, since?: string) =>
  req('/sync/pull', { method: 'POST', cookie, body: since ? { since } : {} }).then((r) =>
    jsonOf<PullResult>(r),
  );

describe('sync pull', () => {
  it('geeft de groepen, autos en data van de gebruiker', async () => {
    const s = await setupAuto('pull@vroom.test');
    await req(`/autos/${s.autoId}/ritten`, { method: 'POST', cookie: s.cookie, body: { km: 20 } });

    const res = await pull(s.cookie);
    expect(res.groepen).toHaveLength(1);
    expect(res.autos).toHaveLength(1);
    expect(res.ritten).toHaveLength(1);
  });

  it('geeft alleen wijzigingen sinds de cursor (delta)', async () => {
    const s = await setupAuto('delta@vroom.test');
    const eerste = await pull(s.cookie);
    expect(eerste.ritten).toHaveLength(0);

    await wacht(10);
    await req(`/autos/${s.autoId}/ritten`, { method: 'POST', cookie: s.cookie, body: { km: 30 } });

    const delta = await pull(s.cookie, eerste.serverTime);
    expect(delta.ritten).toHaveLength(1);
    expect(delta.autos).toHaveLength(0); // auto ongewijzigd sinds cursor
  });

  it('neemt verwijderde records mee als tombstone', async () => {
    const s = await setupAuto('tombstone@vroom.test');
    const rit = await jsonOf<{ id: string }>(
      await req(`/autos/${s.autoId}/ritten`, { method: 'POST', cookie: s.cookie, body: { km: 5 } }),
    );
    const voorDelete = await pull(s.cookie);

    await wacht(10);
    await req(`/autos/${s.autoId}/ritten/${rit.id}`, { method: 'DELETE', cookie: s.cookie });

    const delta = await pull(s.cookie, voorDelete.serverTime);
    const tombstone = delta.ritten.find((r) => r.id === rit.id);
    expect(tombstone?.deletedAt).not.toBeNull();
  });
});

describe('sync push', () => {
  it('voegt een offline aangemaakte rit toe', async () => {
    const s = await setupAuto('push-new@vroom.test');
    const ritId = crypto.randomUUID();
    const res = await req('/sync/push', {
      method: 'POST',
      cookie: s.cookie,
      body: {
        ritten: [
          {
            id: ritId,
            autoId: s.autoId,
            datum: new Date().toISOString(),
            km: 12.3,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.status).toBe(200);

    const after = await pull(s.cookie);
    expect(after.ritten.find((r) => r.id === ritId)?.km).toBe(12.3);
  });

  it('past last-write-wins toe: oudere update verliest, nieuwere wint', async () => {
    const s = await setupAuto('lww@vroom.test');
    const ritId = crypto.randomUUID();
    const basis = {
      id: ritId,
      autoId: s.autoId,
      datum: '2026-01-01T00:00:00.000Z',
    };

    // insert met updatedAt 2026-03-01
    await req('/sync/push', {
      method: 'POST',
      cookie: s.cookie,
      body: { ritten: [{ ...basis, km: 100, updatedAt: '2026-03-01T00:00:00.000Z' }] },
    });

    // oudere update (2026-02-01) -> conflict, server blijft 100
    const ouder = await jsonOf<{ conflicts: { ritten: { id: string; km: number }[] } }>(
      await req('/sync/push', {
        method: 'POST',
        cookie: s.cookie,
        body: { ritten: [{ ...basis, km: 1, updatedAt: '2026-02-01T00:00:00.000Z' }] },
      }),
    );
    expect(ouder.conflicts.ritten).toHaveLength(1);
    expect(ouder.conflicts.ritten[0]!.km).toBe(100);

    // nieuwere update (2026-06-01) -> toegepast
    await req('/sync/push', {
      method: 'POST',
      cookie: s.cookie,
      body: { ritten: [{ ...basis, km: 250, updatedAt: '2026-06-01T00:00:00.000Z' }] },
    });

    const after = await pull(s.cookie);
    expect(after.ritten.find((r) => r.id === ritId)?.km).toBe(250);
  });
});

describe('sync security', () => {
  it('pull lekt geen data van andere groepen', async () => {
    const a = await setupAuto('sync-a@vroom.test');
    await req(`/autos/${a.autoId}/ritten`, { method: 'POST', cookie: a.cookie, body: { km: 99 } });

    const outsider = await loginAs(await createUser('sync-outsider@vroom.test'));
    const res = await pull(outsider);
    expect(res.groepen).toHaveLength(0);
    expect(res.autos).toHaveLength(0);
    expect(res.ritten).toHaveLength(0);
  });

  it('push naar een ontoegankelijke auto wordt geweigerd (403)', async () => {
    const owner = await setupAuto('sync-owner@vroom.test');
    const outsider = await loginAs(await createUser('sync-pusher@vroom.test'));
    const res = await req('/sync/push', {
      method: 'POST',
      cookie: outsider,
      body: {
        ritten: [
          {
            id: crypto.randomUUID(),
            autoId: owner.autoId,
            datum: new Date().toISOString(),
            km: 1,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.status).toBe(403);
  });

  it('vereist authenticatie', async () => {
    expect((await req('/sync/pull', { method: 'POST', body: {} })).status).toBe(401);
    expect((await req('/sync/push', { method: 'POST', body: {} })).status).toBe(401);
  });
});
