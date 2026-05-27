import { describe, expect, it } from 'vitest';
import { createUser, jsonOf, loginAs, req } from './helpers.js';

interface GroepDetail {
  id: string;
  naam: string;
  type: string;
  leden: { userId: string; rol: string; email: string }[];
}

async function maakGroep(cookie: string, naam = 'Test Groep', type = 'familie') {
  const res = await req('/groepen', { method: 'POST', cookie, body: { naam, type } });
  return jsonOf<{ id: string; naam: string; type: string }>(res);
}

describe('groepen', () => {
  it('maakt een groep aan met de maker als admin', async () => {
    const user = await createUser('admin@vroom.test');
    const cookie = await loginAs(user);
    const groep = await maakGroep(cookie);

    const detail = await jsonOf<GroepDetail>(await req(`/groepen/${groep.id}`, { cookie }));
    expect(detail.leden).toHaveLength(1);
    expect(detail.leden[0]!.userId).toBe(user.id);
    expect(detail.leden[0]!.rol).toBe('admin');
  });

  it('toont alleen groepen waar ik in zit', async () => {
    const a = await createUser('a@vroom.test');
    const b = await createUser('b@vroom.test');
    const ca = await loginAs(a);
    const cb = await loginAs(b);
    await maakGroep(ca, 'Groep A');

    const lijstB = await jsonOf<unknown[]>(await req('/groepen', { cookie: cb }));
    expect(lijstB).toHaveLength(0);
    const lijstA = await jsonOf<unknown[]>(await req('/groepen', { cookie: ca }));
    expect(lijstA).toHaveLength(1);
  });

  it('admin kan naam en type wijzigen', async () => {
    const user = await createUser('patch@vroom.test');
    const cookie = await loginAs(user);
    const groep = await maakGroep(cookie);
    const res = await req(`/groepen/${groep.id}`, {
      method: 'PATCH',
      cookie,
      body: { naam: 'Nieuwe Naam', type: 'stel' },
    });
    expect(res.status).toBe(200);
    const body = await jsonOf<{ naam: string; type: string }>(res);
    expect(body.naam).toBe('Nieuwe Naam');
    expect(body.type).toBe('stel');
  });

  it('niet-lid krijgt 404 op een bestaande groep', async () => {
    const owner = await createUser('owner@vroom.test');
    const outsider = await createUser('outsider@vroom.test');
    const groep = await maakGroep(await loginAs(owner));
    const res = await req(`/groepen/${groep.id}`, { cookie: await loginAs(outsider) });
    expect(res.status).toBe(404);
  });

  it('solo-lid dat vertrekt sluit de groep', async () => {
    const user = await createUser('solo@vroom.test');
    const cookie = await loginAs(user);
    const groep = await maakGroep(cookie, 'Solo', 'solo');
    const res = await req(`/groepen/${groep.id}/leave`, { method: 'POST', cookie });
    expect(res.status).toBe(200);
    const body = await jsonOf<{ groepGesloten: boolean }>(res);
    expect(body.groepGesloten).toBe(true);
    expect((await req('/groepen', { cookie })).status).toBe(200);
    expect(await jsonOf<unknown[]>(await req('/groepen', { cookie }))).toHaveLength(0);
  });
});
