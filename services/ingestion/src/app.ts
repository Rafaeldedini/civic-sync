import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { prisma } from '@civic-sync/database';
import { sensorRoutes } from './routes/sensors.js';
import { alertRoutes } from './routes/alerts.js';
import { adminRoutes } from './routes/admin.js';

export async function buildApp(): ReturnType<typeof Fastify> {
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
    // ── Generate unique request ID for correlation ─────────────────────────
    genReqId: (req) => {
      return (req.headers['x-request-id'] as string) ?? randomUUID();
    },
  });

  // ── Zod type provider ─────────────────────────────────────────────────────
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ── Plugins ───────────────────────────────────────────────────────────────

  await app.register(cors, { origin: true });

  // ── Helmet (Security Headers) ─────────────────────────────────────────────
  //
  // Adds secure HTTP headers automatically:
  //   - Content-Security-Policy
  //   - X-Content-Type-Options: nosniff
  //   - X-Frame-Options: SAMEORIGIN
  //   - Strict-Transport-Security
  //   - X-XSS-Protection
  //
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP for API-only service
  });

  // ── Rate Limiting (DDoS Protection) ───────────────────────────────────────
  await app.register(rateLimit, {
    max: 200,            // max 200 requests per window
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'], // allow localhost for dev
    keyGenerator: (req) => req.ip,
  });

  // ── Correlation ID Hook ───────────────────────────────────────────────────
  //
  // Propagates the X-Request-ID from the incoming request through the entire
  // pipeline. Workers receive this ID inside the job data, allowing end-to-end
  // tracing of a sensor reading from ingestion → queue → persistence → processing.
  //
  app.addHook('onSend', (_request, reply, _payload, done) => {
    reply.header('X-Request-ID', _request.id);
    done();
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(sensorRoutes);
  await app.register(alertRoutes);
  await app.register(adminRoutes);

  // ── Deep Health Check ─────────────────────────────────────────────────────
  //
  // Tests actual connectivity to Redis and PostgreSQL, not just "status: ok".
  // Returns HTTP 200 when healthy, HTTP 503 (Service Unavailable) when degraded.
  //
  app.get('/health', async (_request, reply) => {
    const health: Record<string, unknown> = {
      status: 'ok',
      service: 'ingestion',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      dependencies: {} as Record<string, unknown>,
    };

    let httpStatus = 200;

    // ── Check PostgreSQL ──────────────────────────────────────────────────
    try {
      await prisma.$queryRaw`SELECT 1`;
      (health.dependencies as Record<string, unknown>).postgres = { status: 'connected' };
    } catch (err) {
      (health.dependencies as Record<string, unknown>).postgres = {
        status: 'disconnected',
        error: (err as Error).message,
      };
      health.status = 'degraded';
      httpStatus = 503;
    }

    // ── Check Redis (via BullMQ producer connection) ──────────────────────
    try {
      const { getRedisConnection } = await import('./queue/producer.js');
      const redisConn = getRedisConnection();
      const pong = await redisConn.ping();
      (health.dependencies as Record<string, unknown>).redis = {
        status: pong === 'PONG' ? 'connected' : 'unknown',
      };
    } catch (err) {
      (health.dependencies as Record<string, unknown>).redis = {
        status: 'disconnected',
        error: (err as Error).message,
      };
      health.status = 'degraded';
      httpStatus = 503;
    }

    return reply.status(httpStatus).send(health);
  });

  return app;
}
