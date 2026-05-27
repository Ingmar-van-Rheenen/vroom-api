import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './env.js';

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[vroom-api] listening on http://localhost:${info.port} (${env.NODE_ENV})`);
  console.log(`[vroom-api] docs:    http://localhost:${info.port}/docs`);
});
