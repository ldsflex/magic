import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { HOST, PORT, WEB_DIST, loadConfig } from './config.js';
import { registerApi } from './routes/api.js';
import { startPolling, stopPolling } from './store.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

async function main(): Promise<void> {
  const config = loadConfig();

  await registerApi(app);

  if (existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST, index: ['index.html'] });
    // The dashboard and the phone companion are the same SPA on two routes.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  } else {
    app.log.warn(`web/dist not built — run "npm run build" (looked in ${WEB_DIST})`);
  }

  startPolling();

  await app.listen({ port: PORT, host: HOST });
  app.log.info(
    `magic is up for ${config.household.name} (${config.location.name}, ${config.household.timezone})`,
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopPolling();
    void app.close().then(() => process.exit(0));
  });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
