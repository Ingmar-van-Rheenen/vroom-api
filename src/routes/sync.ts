import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { requireUser, type AuthVariables } from '../auth/middleware.js';
import { db } from '../db/client.js';
import { autos, groepen, groepLeden, ritten, tankbeurten } from '../db/schema.js';
import type { Auto, Groep, Rit, Tankbeurt } from '../db/schema.js';
import { errors } from '../lib/errors.js';

export const syncRoutes = new OpenAPIHono<{ Variables: AuthVariables }>();

// ---------- serializers (sync bevat altijd updatedAt + deletedAt) ----------

function syncGroep(g: Groep) {
  return {
    id: g.id,
    naam: g.naam,
    type: g.type,
    createdBy: g.createdBy,
    updatedAt: g.updatedAt.toISOString(),
    deletedAt: g.deletedAt?.toISOString() ?? null,
  };
}

function syncAuto(a: Auto) {
  return {
    id: a.id,
    groepId: a.groepId,
    naam: a.naam,
    merk: a.merk,
    kenteken: a.kenteken,
    kmPerLiter: a.kmPerLiter,
    prijsPerLiter: a.prijsPerLiter,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt?.toISOString() ?? null,
  };
}

function syncRit(r: Rit) {
  return {
    id: r.id,
    autoId: r.autoId,
    userId: r.userId,
    datum: r.datum.toISOString(),
    startLat: r.startLat,
    startLng: r.startLng,
    eindLat: r.eindLat,
    eindLng: r.eindLng,
    km: r.km,
    gpsTrack: r.gpsTrack ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString() ?? null,
  };
}

function syncTank(t: Tankbeurt) {
  return {
    id: t.id,
    autoId: t.autoId,
    userId: t.userId,
    datum: t.datum.toISOString(),
    liters: t.liters,
    prijsPerLiter: t.prijsPerLiter,
    totaal: t.totaal,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt?.toISOString() ?? null,
  };
}

async function groepIdsVoor(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: groepLeden.groepId })
    .from(groepLeden)
    .where(eq(groepLeden.userId, userId));
  return rows.map((r) => r.id);
}

// ---------- pull ----------

const PullRequest = z.object({ since: z.string().datetime().optional() });

syncRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/sync/pull',
    tags: ['sync'],
    summary: 'Haal wijzigingen op sinds een tijdstip',
    middleware: [requireUser] as const,
    request: { body: { content: { 'application/json': { schema: PullRequest } } } },
    responses: { 200: { description: 'OK' } },
  }),
  async (c) => {
    const user = c.get('user');
    const { since } = c.req.valid('json');
    const sinceDate = since ? new Date(since) : new Date(0);
    const serverTime = new Date();

    const groepIds = await groepIdsVoor(user.id);
    if (groepIds.length === 0) {
      return c.json({
        serverTime: serverTime.toISOString(),
        groepen: [],
        autos: [],
        ritten: [],
        tankbeurten: [],
      });
    }

    const groepenRows = await db
      .select()
      .from(groepen)
      .where(and(inArray(groepen.id, groepIds), gt(groepen.updatedAt, sinceDate)));

    const alleAutos = await db.select().from(autos).where(inArray(autos.groepId, groepIds));
    const alleAutoIds = alleAutos.map((a) => a.id);
    const gewijzigdeAutos = alleAutos.filter((a) => a.updatedAt > sinceDate);

    const rittenRows = alleAutoIds.length
      ? await db
          .select()
          .from(ritten)
          .where(and(inArray(ritten.autoId, alleAutoIds), gt(ritten.updatedAt, sinceDate)))
      : [];
    const tankRows = alleAutoIds.length
      ? await db
          .select()
          .from(tankbeurten)
          .where(
            and(inArray(tankbeurten.autoId, alleAutoIds), gt(tankbeurten.updatedAt, sinceDate)),
          )
      : [];

    return c.json({
      serverTime: serverTime.toISOString(),
      groepen: groepenRows.map(syncGroep),
      autos: gewijzigdeAutos.map(syncAuto),
      ritten: rittenRows.map(syncRit),
      tankbeurten: tankRows.map(syncTank),
    });
  },
);

// ---------- push ----------

const Coord = z.number();

const PushAuto = z.object({
  id: z.string().uuid(),
  groepId: z.string().uuid(),
  naam: z.string().min(1).max(80),
  merk: z.string().max(80).nullable().optional(),
  kenteken: z.string().max(16).nullable().optional(),
  kmPerLiter: z.number().positive(),
  prijsPerLiter: z.number().positive(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
});

const PushRit = z.object({
  id: z.string().uuid(),
  autoId: z.string().uuid(),
  datum: z.string().datetime(),
  startLat: Coord.nullable().optional(),
  startLng: Coord.nullable().optional(),
  eindLat: Coord.nullable().optional(),
  eindLng: Coord.nullable().optional(),
  km: z.number().nonnegative(),
  gpsTrack: z
    .array(z.object({ lat: z.number(), lng: z.number() }))
    .nullable()
    .optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
});

const PushTank = z.object({
  id: z.string().uuid(),
  autoId: z.string().uuid(),
  datum: z.string().datetime(),
  liters: z.number().positive(),
  prijsPerLiter: z.number().positive(),
  totaal: z.number().nonnegative(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
});

const PushRequest = z.object({
  autos: z.array(PushAuto).optional(),
  ritten: z.array(PushRit).optional(),
  tankbeurten: z.array(PushTank).optional(),
});

syncRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/sync/push',
    tags: ['sync'],
    summary: 'Stuur lokale wijzigingen (last-write-wins op updatedAt)',
    middleware: [requireUser] as const,
    request: { body: { content: { 'application/json': { schema: PushRequest } } } },
    responses: {
      200: { description: 'Toegepast' },
      403: { description: 'Geen toegang tot een groep of auto' },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const heeftItems =
      (body.autos?.length ?? 0) + (body.ritten?.length ?? 0) + (body.tankbeurten?.length ?? 0) > 0;

    const groepIds = await groepIdsVoor(user.id);
    if (!heeftItems) {
      return c.json({
        serverTime: new Date().toISOString(),
        conflicts: { autos: [], ritten: [], tankbeurten: [] },
      });
    }
    if (groepIds.length === 0) throw errors.forbidden('Geen toegang');

    // Toegankelijke auto-ids (voor rit/tankbeurt-validatie en groep-check bij autos)
    const toegankelijkeAutos = await db
      .select({ id: autos.id, groepId: autos.groepId })
      .from(autos)
      .where(inArray(autos.groepId, groepIds));
    const autoGroep = new Map(toegankelijkeAutos.map((a) => [a.id, a.groepId]));

    const result = await db.transaction(async (tx) => {
      const conflicts = {
        autos: [] as ReturnType<typeof syncAuto>[],
        ritten: [] as ReturnType<typeof syncRit>[],
        tankbeurten: [] as ReturnType<typeof syncTank>[],
      };

      for (const item of body.autos ?? []) {
        if (!groepIds.includes(item.groepId)) throw errors.forbidden('Geen toegang tot deze groep');
        const existing = (await tx.select().from(autos).where(eq(autos.id, item.id)).limit(1))[0];
        if (existing) {
          if (!groepIds.includes(existing.groepId))
            throw errors.forbidden('Geen toegang tot deze auto');
          if (new Date(item.updatedAt) > existing.updatedAt) {
            await tx
              .update(autos)
              .set({
                naam: item.naam,
                merk: item.merk ?? null,
                kenteken: item.kenteken ?? null,
                kmPerLiter: item.kmPerLiter,
                prijsPerLiter: item.prijsPerLiter,
                updatedAt: new Date(item.updatedAt),
                deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
              })
              .where(eq(autos.id, item.id));
          } else {
            conflicts.autos.push(syncAuto(existing));
          }
        } else {
          await tx.insert(autos).values({
            id: item.id,
            groepId: item.groepId,
            naam: item.naam,
            merk: item.merk ?? null,
            kenteken: item.kenteken ?? null,
            kmPerLiter: item.kmPerLiter,
            prijsPerLiter: item.prijsPerLiter,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
            updatedAt: new Date(item.updatedAt),
            deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
          });
          autoGroep.set(item.id, item.groepId);
        }
      }

      for (const item of body.ritten ?? []) {
        if (!autoGroep.has(item.autoId)) throw errors.forbidden('Geen toegang tot deze auto');
        const existing = (await tx.select().from(ritten).where(eq(ritten.id, item.id)).limit(1))[0];
        if (existing) {
          if (!autoGroep.has(existing.autoId)) throw errors.forbidden('Geen toegang tot deze rit');
          if (new Date(item.updatedAt) > existing.updatedAt) {
            await tx
              .update(ritten)
              .set({
                datum: new Date(item.datum),
                startLat: item.startLat ?? null,
                startLng: item.startLng ?? null,
                eindLat: item.eindLat ?? null,
                eindLng: item.eindLng ?? null,
                km: item.km,
                gpsTrack: item.gpsTrack ?? null,
                updatedAt: new Date(item.updatedAt),
                deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
              })
              .where(eq(ritten.id, item.id));
          } else {
            conflicts.ritten.push(syncRit(existing));
          }
        } else {
          await tx.insert(ritten).values({
            id: item.id,
            autoId: item.autoId,
            userId: user.id,
            datum: new Date(item.datum),
            startLat: item.startLat ?? null,
            startLng: item.startLng ?? null,
            eindLat: item.eindLat ?? null,
            eindLng: item.eindLng ?? null,
            km: item.km,
            gpsTrack: item.gpsTrack ?? null,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
            updatedAt: new Date(item.updatedAt),
            deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
          });
        }
      }

      for (const item of body.tankbeurten ?? []) {
        if (!autoGroep.has(item.autoId)) throw errors.forbidden('Geen toegang tot deze auto');
        const existing = (
          await tx.select().from(tankbeurten).where(eq(tankbeurten.id, item.id)).limit(1)
        )[0];
        if (existing) {
          if (!autoGroep.has(existing.autoId))
            throw errors.forbidden('Geen toegang tot deze tankbeurt');
          if (new Date(item.updatedAt) > existing.updatedAt) {
            await tx
              .update(tankbeurten)
              .set({
                datum: new Date(item.datum),
                liters: item.liters,
                prijsPerLiter: item.prijsPerLiter,
                totaal: item.totaal,
                updatedAt: new Date(item.updatedAt),
                deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
              })
              .where(eq(tankbeurten.id, item.id));
          } else {
            conflicts.tankbeurten.push(syncTank(existing));
          }
        } else {
          await tx.insert(tankbeurten).values({
            id: item.id,
            autoId: item.autoId,
            userId: user.id,
            datum: new Date(item.datum),
            liters: item.liters,
            prijsPerLiter: item.prijsPerLiter,
            totaal: item.totaal,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
            updatedAt: new Date(item.updatedAt),
            deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
          });
        }
      }

      return conflicts;
    });

    return c.json({ serverTime: new Date().toISOString(), conflicts: result });
  },
);
