import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './env.js';
import { errorHandler } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { autosRoutes } from './routes/autos.js';
import { groepenRoutes } from './routes/groepen.js';
import { healthRoutes } from './routes/health.js';
import { inviteRoutes } from './routes/invites.js';
import { meRoutes } from './routes/me.js';
import { rittenRoutes } from './routes/ritten.js';
import { saldoRoutes } from './routes/saldo.js';
import { syncRoutes } from './routes/sync.js';
import { tankbeurtenRoutes } from './routes/tankbeurten.js';

export function createApp() {
  const app = new OpenAPIHono();

  if (env.NODE_ENV !== 'test') {
    app.use('*', logger());
  }
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: [env.APP_URL],
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.onError(errorHandler);

  app.route('/', healthRoutes);
  app.route('/', authRoutes);
  app.route('/', meRoutes);
  app.route('/', groepenRoutes);
  app.route('/', inviteRoutes);
  app.route('/', autosRoutes);
  app.route('/', rittenRoutes);
  app.route('/', tankbeurtenRoutes);
  app.route('/', saldoRoutes);
  app.route('/', syncRoutes);

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Vroom API',
      version: '0.1.0',
      description: 'Backend voor de Vroom multi-user trip- en brandstof-tracker.',
    },
    servers: [{ url: env.API_URL, description: env.NODE_ENV }],
  });

  app.get(
    '/docs',
    apiReference({
      spec: { url: '/openapi.json' },
      theme: 'default',
      pageTitle: 'Vroom API Docs',
    }),
  );

  app.get('/', (c) =>
    c.json({
      name: 'vroom-api',
      version: '0.1.0',
      docs: `${env.API_URL}/docs`,
    }),
  );

  return app;
}

export const app = createApp();
export type App = typeof app;
