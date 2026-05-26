import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export const healthRoutes = new OpenAPIHono();

const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  uptime: z.number(),
  db: z.enum(['up', 'down']),
});

healthRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/health',
    tags: ['system'],
    summary: 'Liveness + DB-check',
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: HealthResponse } },
      },
    },
  }),
  async (c) => {
    let dbStatus: 'up' | 'down' = 'up';
    try {
      await db.execute(sql`select 1`);
    } catch {
      dbStatus = 'down';
    }

    return c.json(
      {
        status: dbStatus === 'up' ? ('ok' as const) : ('degraded' as const),
        uptime: process.uptime(),
        db: dbStatus,
      },
      200,
    );
  },
);
