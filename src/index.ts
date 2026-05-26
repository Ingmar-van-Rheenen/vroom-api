import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './env.js';
import { errorHandler } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';

const app = new OpenAPIHono();

app.use('*', logger());
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

const port = env.PORT;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[vroom-api] listening on http://localhost:${info.port} (${env.NODE_ENV})`);
  console.log(`[vroom-api] docs:    http://localhost:${info.port}/docs`);
});
