import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { sensorRoutes } from './routes/sensors.js';
import { alertRoutes } from './routes/alerts.js';

export async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // ── Zod type provider ─────────────────────────────────────────────────────
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ── Plugins ───────────────────────────────────────────────────────────────
  await app.register(cors, { origin: true });

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(sensorRoutes);
  await app.register(alertRoutes);

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', service: 'ingestion' }));

  return app;
}
