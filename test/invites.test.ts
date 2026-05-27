import { describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { groepInvites } from '../src/db/schema.js';
import { generateToken } from '../src/lib/tokens.js';
import { createUser, jsonOf, loginAs, req } from './helpers.js';

async function maakGroepMetAdmin() {
  const admin = await createUser('inv-admin@vroom.test');
  const cookie = await loginAs(admin);
  const groep = await jsonOf<{ id: string }>(
    await req('/groepen', { method: 'POST', cookie, body: { naam: 'Inv', type: 'familie' } }),
  );
  return { admin, cookie, groepId: groep.id };
}

describe('invites', () => {
  it('admin maakt een open invite, tweede user accepteert en wordt lid', async () => {
    const { cookie, groepId } = await maakGroepMetAdmin();
    const inv = await jsonOf<{ code: string }>(
      await req(`/groepen/${groepId}/invites`, { method: 'POST', cookie, body: {} }),
    );

    const preview = await req(`/invites/${inv.code}`);
    expect(preview.status).toBe(200);

    const partner = await createUser('inv-partner@vroom.test');
    const pcookie = await loginAs(partner);
    const accept = await req(`/invites/${inv.code}/accept`, { method: 'POST', cookie: pcookie });
    expect(accept.status).toBe(200);

    const detail = await jsonOf<{ leden: unknown[] }>(await req(`/groepen/${groepId}`, { cookie }));
    expect(detail.leden).toHaveLength(2);
  });

  it('een gebruikte invite kan niet opnieuw worden geaccepteerd', async () => {
    const { cookie, groepId } = await maakGroepMetAdmin();
    const inv = await jsonOf<{ code: string }>(
      await req(`/groepen/${groepId}/invites`, { method: 'POST', cookie, body: {} }),
    );
    const u = await loginAs(await createUser('inv-twice@vroom.test'));
    expect((await req(`/invites/${inv.code}/accept`, { method: 'POST', cookie: u })).status).toBe(
      200,
    );
    const tweede = await req(`/invites/${inv.code}/accept`, { method: 'POST', cookie: u });
    expect(tweede.status).toBe(404);
  });

  it('e-mailgebonden invite weigert een ander adres', async () => {
    const { cookie, groepId } = await maakGroepMetAdmin();
    const inv = await jsonOf<{ code: string }>(
      await req(`/groepen/${groepId}/invites`, {
        method: 'POST',
        cookie,
        body: { email: 'bedoeld@vroom.test' },
      }),
    );
    const ander = await loginAs(await createUser('ander@vroom.test'));
    const res = await req(`/invites/${inv.code}/accept`, { method: 'POST', cookie: ander });
    expect(res.status).toBe(403);
  });

  it('een verlopen invite geeft 410 bij preview en faalt bij accept', async () => {
    const { admin, groepId } = await maakGroepMetAdmin();
    const code = generateToken(16);
    await db.insert(groepInvites).values({
      groepId,
      code,
      createdBy: admin.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect((await req(`/invites/${code}`)).status).toBe(410);
    const u = await loginAs(await createUser('te-laat@vroom.test'));
    expect((await req(`/invites/${code}/accept`, { method: 'POST', cookie: u })).status).toBe(404);
  });
});
