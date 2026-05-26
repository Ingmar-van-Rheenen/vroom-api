import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser, type AuthVariables } from '../auth/middleware.js';

export const meRoutes = new OpenAPIHono<{ Variables: AuthVariables }>();

const MeResponse = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  naam: z.string(),
});

meRoutes.use('/me', requireUser);
meRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    tags: ['auth'],
    summary: 'Huidige ingelogde gebruiker',
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: MeResponse } },
      },
      401: { description: 'Niet ingelogd' },
    },
  }),
  (c) => {
    const user = c.get('user');
    return c.json({ id: user.id, email: user.email, naam: user.naam }, 200);
  },
);
